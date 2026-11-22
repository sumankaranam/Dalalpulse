"""
DalalPulse: End-to-End Orchestrator Pipeline
Coordinates Ingestion -> Ticker Mapping -> GPU Funnel -> Signals Engine -> Gemini Synthesis -> Supabase / Telegram.
"""

import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import requests

from config_sync import SupabaseSync, PipelineConfig
from ticker_mapper import TickerMapper
from ingest import DataIngestor
from gpu_funnel import GPUFunnel, free_gpu_memory
from signals import SignalEngine
from synthesize import BriefSynthesizer

def send_telegram_alert(bot_token: str, chat_id: str, message: str) -> bool:
    """Dispatches a formatted Markdown alert to Telegram."""
    if not bot_token or not chat_id or bot_token.startswith("your_"):
        return False
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown"
        }
        resp = requests.post(url, json=payload, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        print(f"[pipeline] Failed to send Telegram alert: {e}")
        return False

def run_pipeline(trigger_source: str = "scheduled") -> Dict[str, Any]:
    """Executes the full DalalPulse sentiment intelligence radar pipeline."""
    start_time = time.time()
    sync = SupabaseSync()
    
    # 1. Fetch remote config
    print(f"\n========================================================")
    print(f"🚀 DalalPulse Pipeline Starting [{trigger_source.upper()}] - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"========================================================")
    
    config: PipelineConfig = sync.fetch_config()
    run_id = sync.create_run_log(trigger_source=trigger_source)
    
    logs = []
    def log(msg: str):
        print(msg)
        logs.append(msg)

    total_scraped = 0
    total_detected = 0
    signals_count = 0
    peak_vram_mb = 0.0

    try:
        # Step 1: Ingestion
        log(f"📥 [Step 1/5] Ingesting retail sentiment data...")
        ingestor = DataIngestor()
        total_scraped = ingestor.ingest_all(
            subreddits=config.subreddits,
            include_valuepickr=config.valuepickr_enabled,
            include_tradingqna=config.tradingqna_enabled,
            include_stocktwits=config.stocktwits_enabled
        )
        log(f"   ✓ Ingestion complete: {total_scraped} raw posts stored.")

        # Load recent posts for signal processing
        df = ingestor.get_posts_df(days=1)
        if df.empty:
            log("⚠️ No recent posts available in local DuckDB to process.")
            sync.update_run_log(run_id, status="success", posts_scraped=total_scraped, duration_seconds=time.time() - start_time, logs="\n".join(logs))
            return {"status": "success", "signals": 0}

        # Step 2: Ticker Mapping
        log(f"🔍 [Step 2/5] Mapping NSE tickers & retail aliases across {len(df)} posts...")
        mapper = TickerMapper()
        posts_with_tickers = []
        unique_tickers_detected = set()

        for _, row in df.iterrows():
            content = f"{row.get('title', '')} {row.get('body', '')}"
            matches = mapper.extract_tickers(content)
            if matches:
                post_dict = row.to_dict()
                syms = [m[0] for m in matches]
                post_dict["detected_tickers"] = syms
                for s in syms:
                    unique_tickers_detected.add(s)
                posts_with_tickers.append(post_dict)

        total_detected = len(unique_tickers_detected)
        log(f"   ✓ Detected {total_detected} unique NSE tickers across {len(posts_with_tickers)} posts.")

        if not posts_with_tickers:
            log("ℹ️ No ticker mentions detected in today's batch.")
            sync.update_run_log(run_id, status="success", posts_scraped=total_scraped, tickers_detected=0, duration_seconds=time.time() - start_time, logs="\n".join(logs))
            return {"status": "success", "signals": 0}

        # Step 3: GPU Funnel (Dedup -> FinBERT Sentiment)
        log(f"⚡ [Step 3/5] Running 3-stage GPU Funnel (Max VRAM 4.5 GB)...")
        funnel = GPUFunnel()
        # Stage 1: Dedup
        deduped_posts = funnel.stage1_deduplicate(posts_with_tickers)
        # Stage 2: FinBERT Sentiment
        scored_posts = funnel.stage2_sentiment_scoring(deduped_posts)
        peak_vram_mb = funnel.peak_vram
        log(f"   ✓ GPU Funnel complete. Peak VRAM: {peak_vram_mb:.1f} MB.")

        # Step 4: Mathematical Signal Computation
        log(f"📊 [Step 4/5] Computing 14d Z-Scores, Weighted Sentiment & Persona Divergence...")
        signal_engine = SignalEngine(db_path=ingestor.db_path)
        raw_signals = signal_engine.compute_daily_signals(
            scored_posts=scored_posts,
            min_mentions=config.min_mention_threshold,
            z_threshold=float(config.z_score_threshold)
        )
        log(f"   ✓ Identified {len(raw_signals)} high-confidence signals exceeding threshold.")

        # Limit to top N for LLM synthesis
        top_signals = raw_signals[:config.max_synthesize_tickers]

        # Step 5: Frontier LLM Brief Synthesis
        log(f"🧠 [Step 5/5] Synthesizing frontier briefs with Gemini 2.5 Flash for top {len(top_signals)} stocks...")
        synthesizer = BriefSynthesizer()
        final_signals = synthesizer.enrich_signals(top_signals, mapper.get_company_name)
        signals_count = len(final_signals)

        # Step 6: Push to Supabase
        if final_signals:
            log(f"☁️ Pushing {signals_count} signals to Supabase daily_signals...")
            sync.push_signals(final_signals)

        # Step 7: Telegram Alert (if enabled)
        if config.telegram_notifications and final_signals:
            bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
            chat_id = os.getenv("TELEGRAM_CHAT_ID")
            if bot_token and chat_id:
                msg_lines = [
                    f"📡 *DalalPulse Radar Brief — {datetime.now().strftime('%d %b %Y')}*",
                    f"Top Flagged Retail Sentiment Spikes:\n"
                ]
                for s in final_signals[:5]:
                    emoji = "🟢" if s["sentiment_label"] == "Bullish" else ("🔴" if s["sentiment_label"] == "Bearish" else "⚪")
                    msg_lines.append(
                        f"{emoji} *{s['ticker']}* ({s['company_name']})\n"
                        f"• Z-Score: `{s['mention_z_score']:+.2f}σ` | Sentiment: `{s['sentiment_score']:+.2f}`\n"
                        f"• Signal: `{s['signal_type']}`\n"
                        f"• Catalyst: {s.get('catalyst_summary', '')[:140]}...\n"
                    )
                send_telegram_alert(bot_token, chat_id, "\n".join(msg_lines))
                log("   ✓ Telegram notification dispatched.")

        duration = time.time() - start_time
        log(f"🏁 Pipeline executed successfully in {duration:.1f}s.")
        sync.update_run_log(
            run_id=run_id,
            status="success",
            posts_scraped=total_scraped,
            tickers_detected=total_detected,
            signals_generated=signals_count,
            gpu_vram_peak_mb=peak_vram_mb,
            duration_seconds=duration,
            logs="\n".join(logs)
        )
        return {"status": "success", "signals": signals_count}

    except Exception as e:
        err_msg = traceback.format_exc()
        log(f"❌ Pipeline failed: {err_msg}")
        duration = time.time() - start_time
        sync.update_run_log(
            run_id=run_id,
            status="failed",
            posts_scraped=total_scraped,
            tickers_detected=total_detected,
            signals_generated=signals_count,
            gpu_vram_peak_mb=peak_vram_mb,
            duration_seconds=duration,
            logs="\n".join(logs),
            error_message=str(e)
        )
        return {"status": "failed", "error": str(e)}

    finally:
        free_gpu_memory()

if __name__ == "__main__":
    source = sys.argv[1] if len(sys.argv) > 1 else "manual_cli"
    run_pipeline(trigger_source=source)
