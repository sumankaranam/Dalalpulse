"""
DalalPulse: Signal Engine
Computes 14-day Mention Z-Score, Engagement-Weighted Sentiment,
and Retail vs Deep-Dive Persona Divergence using DuckDB and Pandas.
"""

import math
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
import duckdb

class SignalEngine:
    def __init__(self, db_path: str):
        self.db_path = db_path

    def _get_connection(self):
        return duckdb.connect(self.db_path)

    def compute_daily_signals(
        self,
        scored_posts: List[Dict[str, Any]],
        min_mentions: int = 3,
        z_threshold: float = 1.5,
        watchlist_tickers: Optional[List[str]] = None,
        radar_mode: str = "all_radar"
    ) -> List[Dict[str, Any]]:
        """
        Processes scored posts with detected tickers and computes mathematical signals.
        Supports watchlist priority and watchlist_only filtering.
        """
        if not scored_posts:
            return []

        # Convert to DataFrame
        df = pd.DataFrame(scored_posts)
        if "detected_tickers" not in df.columns or df.empty:
            return []

        watchlist_set = set([t.upper().strip() for t in (watchlist_tickers or [])])

        # Explode detected tickers so each row represents (post, ticker)
        exploded_rows = []
        for _, row in df.iterrows():
            tickers = row.get("detected_tickers", [])
            for sym in tickers:
                exploded_rows.append({
                    "post_id": row["id"],
                    "ticker": sym,
                    "source": row["source"],
                    "author": row.get("author", "anonymous"),
                    "title": row.get("title", ""),
                    "body": row.get("body", ""),
                    "url": row.get("url", ""),
                    "score": int(row.get("score", 0)),
                    "num_comments": int(row.get("num_comments", 0)),
                    "sentiment_score": float(row.get("sentiment_score", 0.0)),
                    "created_utc": pd.to_datetime(row["created_utc"])
                })

        if not exploded_rows:
            return []

        pdf = pd.DataFrame(exploded_rows)

        # Engagement weight: w = 1.0 + ln(1 + max(score,0) + 2*max(comments,0))
        pdf["eng_weight"] = 1.0 + np.log1p(
            np.maximum(0, pdf["score"]) + 2 * np.maximum(0, pdf["num_comments"])
        )
        pdf["weighted_sentiment"] = pdf["sentiment_score"] * pdf["eng_weight"]

        # Classify sources into Personas:
        # Retail: Reddit r/IndianStreetBets, r/DalalStreetTalks, Stocktwits, X (Twitter)
        # Deep-Dive: ValuePickr, TradingQnA, r/IndiaInvestments, Moneycontrol
        def classify_persona(src: str) -> str:
            s = src.lower()
            if "valuepickr" in s or "tradingqna" in s or "indiainvestments" in s or "moneycontrol" in s:
                return "analyst"
            return "retail"

        pdf["persona"] = pdf["source"].apply(classify_persona)

        # Query DuckDB historical daily mentions over last 14 days
        today = datetime.now(timezone.utc).date()
        cutoff_14d = today - timedelta(days=14)

        # Compute ticker aggregated metrics
        grouped = pdf.groupby("ticker")
        signals = []

        for ticker, group in grouped:
            is_watchlist = ticker in watchlist_set

            # In watchlist_only mode, strictly skip non-watchlist stocks
            if radar_mode == "watchlist_only" and not is_watchlist:
                continue

            mention_count = len(group)
            # Watchlist stocks only require 1 mention to be tracked
            req_mentions = 1 if is_watchlist else min_mentions
            if mention_count < req_mentions:
                continue

            # Engagement-weighted sentiment
            total_weight = group["eng_weight"].sum()
            eng_sentiment = float(group["weighted_sentiment"].sum() / total_weight) if total_weight > 0 else 0.0

            # Persona sentiment breakdown
            retail_group = group[group["persona"] == "retail"]
            analyst_group = group[group["persona"] == "analyst"]

            retail_sent = float(retail_group["sentiment_score"].mean()) if not retail_group.empty else eng_sentiment
            analyst_sent = float(analyst_group["sentiment_score"].mean()) if not analyst_group.empty else eng_sentiment
            divergence = float(retail_sent - analyst_sent)

            # Sources breakdown
            sources_counts = group["source"].value_counts().to_dict()

            # Sample headlines
            headlines = group["title"].dropna().drop_duplicates().head(5).tolist()

            # Exact verbatim forum & social quotations
            exact_quotes = []
            seen_quotes = set()
            for _, p in group.sort_values(by="score", ascending=False).iterrows():
                quote_text = (p.get("body") or p.get("title") or "").strip()
                if not quote_text or quote_text in seen_quotes:
                    continue
                clean_quote = quote_text if len(quote_text) <= 400 else quote_text[:397] + "..."
                seen_quotes.add(clean_quote)

                # Format human readable source name
                src_raw = str(p.get("source", "forum"))
                src_display = (
                    "Reddit r/IndianStreetBets" if "indianstreetbets" in src_raw.lower()
                    else "Reddit r/IndiaInvestments" if "indiainvestments" in src_raw.lower()
                    else "Reddit r/DalalStreetTalks" if "dalalstreettalks" in src_raw.lower()
                    else "Reddit" if "reddit" in src_raw.lower()
                    else "ValuePickr" if "valuepickr" in src_raw.lower()
                    else "TradingQnA" if "tradingqna" in src_raw.lower()
                    else "Stocktwits" if "stocktwits" in src_raw.lower()
                    else "Moneycontrol" if "moneycontrol" in src_raw.lower()
                    else "X (Twitter)" if "x_twitter" in src_raw.lower()
                    else src_raw
                )

                exact_quotes.append({
                    "source": src_display,
                    "author": str(p.get("author", "trader")),
                    "quote": clean_quote,
                    "title": str(p.get("title", "")),
                    "url": str(p.get("url", "")),
                    "score": int(p.get("score", 0)),
                    "created_at": p.get("created_utc").isoformat() if hasattr(p.get("created_utc"), "isoformat") else str(p.get("created_utc"))
                })
                if len(exact_quotes) >= 5:
                    break

            # 14-day Z-Score computation
            z_score = self._compute_14d_zscore(ticker, mention_count, cutoff_14d)

            # Signal classification
            signal_type = "Normal"
            risk_flags = []

            if z_score >= 2.5:
                signal_type = "Hype Spike"
                risk_flags.append("Extreme Volume / Hype Alert (+2.5σ)")
            elif z_score >= z_threshold and eng_sentiment > 0.25:
                signal_type = "Retail Momentum"
            elif z_score >= z_threshold and eng_sentiment < -0.25:
                signal_type = "Panic Selloff"
                risk_flags.append("Retail Panic Spike")
            elif divergence > 0.45:
                signal_type = "Retail FOMO Trap"
                risk_flags.append("High Divergence: Retail euphoric vs Value investors cautious")
            elif divergence < -0.45:
                signal_type = "Contrarian Accumulation"

            if is_watchlist:
                risk_flags.insert(0, "Watchlist Priority")

            sentiment_label = "Bullish" if eng_sentiment > 0.15 else ("Bearish" if eng_sentiment < -0.15 else "Neutral")

            signals.append({
                "ticker": ticker,
                "mention_count": int(mention_count),
                "mention_z_score": round(float(z_score), 2),
                "sentiment_score": round(float(eng_sentiment), 3),
                "sentiment_label": sentiment_label,
                "retail_vs_analyst_divergence": round(float(divergence), 3),
                "signal_type": signal_type,
                "risk_flags": risk_flags,
                "sources_breakdown": sources_counts,
                "sample_headlines": headlines,
                "exact_quotes": exact_quotes,
                "run_date": today.isoformat()
            })

        # Sort so that watchlist priorities and highest Z-scores are at the top
        signals.sort(key=lambda x: (1 if "Watchlist Priority" in x["risk_flags"] else 0, x["mention_z_score"], x["mention_count"]), reverse=True)
        return signals

    def _compute_14d_zscore(self, ticker: str, today_count: int, cutoff_date) -> float:
        """
        Calculates Z-Score against historical 14-day daily mention baseline in DuckDB.
        Z = (count_today - mean_14d) / max(std_14d, 1.0)
        """
        try:
            conn = self._get_connection()
            # If historical post mentions table exists or fallback to Poisson estimate
            # Check if table exists
            tables = conn.execute("SHOW TABLES").fetchall()
            table_names = [t[0] for t in tables]
            
            if "scraped_posts" in table_names:
                query = """
                    SELECT CAST(created_utc AS DATE) as post_date, COUNT(*) as daily_mentions
                    FROM scraped_posts
                    WHERE (LOWER(title) LIKE ? OR LOWER(body) LIKE ?)
                      AND created_utc >= ? AND created_utc < CURRENT_DATE
                    GROUP BY post_date
                """
                pattern = f"%{ticker.lower()}%"
                rows = conn.execute(query, [pattern, pattern, cutoff_date]).fetchall()
                if rows and len(rows) >= 3:
                    counts = [r[1] for r in rows]
                    # Fill missing days with 0 up to 14 days
                    while len(counts) < 14:
                        counts.append(0)
                    mean_val = float(np.mean(counts))
                    std_val = float(np.std(counts))
                    std_adj = max(std_val, 1.0)
                    return float((today_count - mean_val) / std_adj)
            conn.close()
        except Exception as e:
            pass

        # Fallback heuristic baseline if historical data is freshly populating
        # Baseline assumption: average 2 mentions/day, std = 1.5
        mean_base = 2.0
        std_base = 1.5
        return float((today_count - mean_base) / std_base)

if __name__ == "__main__":
    from pprint import pprint
    engine = SignalEngine(db_path="worker/data/local_cache.duckdb")
    sample_posts = [
        {
            "id": "1",
            "source": "reddit_r_indianstreetbets",
            "score": 45,
            "num_comments": 12,
            "sentiment_score": 0.8,
            "title": "Why ZOMATO is heading to 350 soon",
            "detected_tickers": ["ZOMATO"],
            "created_utc": datetime.now(timezone.utc)
        },
        {
            "id": "2",
            "source": "valuepickr",
            "score": 15,
            "num_comments": 25,
            "sentiment_score": 0.2,
            "title": "Zomato Q3 performance and quick commerce margins breakdown",
            "detected_tickers": ["ZOMATO"],
            "created_utc": datetime.now(timezone.utc)
        },
        {
            "id": "3",
            "source": "reddit_r_indianstreetbets",
            "score": 105,
            "num_comments": 40,
            "sentiment_score": 0.9,
            "title": "Zomato rocket unstoppable, buy calls!",
            "detected_tickers": ["ZOMATO"],
            "created_utc": datetime.now(timezone.utc)
        }
    ]
    sigs = engine.compute_daily_signals(sample_posts, min_mentions=2)
    print("Computed sample signals:")
    pprint(sigs)
