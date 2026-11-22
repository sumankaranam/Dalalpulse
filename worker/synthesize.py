"""
DalalPulse: Frontier Intelligence Synthesizer
Calls Gemini 2.5 Flash to synthesize structured daily briefs for top flagged NSE tickers.
Includes deterministic rule-based fallback if offline or API key is absent.
"""

import os
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

class BriefSynthesizer:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or GEMINI_API_KEY
        self.client = None
        self._init_gemini()

    def _init_gemini(self):
        if not self.api_key or self.api_key.startswith("your_"):
            print("[synthesize] Warning: GEMINI_API_KEY not configured. Rule-based fallback active.")
            return

        try:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            # Try latest available Gemini models
            for m in ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-pro-latest"]:
                try:
                    self.client = genai.GenerativeModel(
                        model_name=m,
                        generation_config={
                            "response_mime_type": "application/json",
                            "temperature": 0.2
                        }
                    )
                    print(f"[synthesize] Gemini client initialized with {m}.")
                    break
                except Exception:
                    continue
        except Exception as e:
            print(f"[synthesize] Gemini client initialization error: {e}")

    def synthesize_ticker(self, signal: Dict[str, Any], company_name: str) -> Dict[str, Any]:
        """Generates AI brief for an individual flagged ticker."""
        ticker = signal.get("ticker", "UNKNOWN")
        z_score = signal.get("mention_z_score", 0.0)
        sent = signal.get("sentiment_score", 0.0)
        divergence = signal.get("retail_vs_analyst_divergence", 0.0)
        headlines = signal.get("sample_headlines", [])
        exact_quotes = signal.get("exact_quotes", [])
        signal_type = signal.get("signal_type", "Normal")

        quote_snippets = [
            f"[{q.get('source')} - @{q.get('author')}]: \"{q.get('quote')}\""
            for q in exact_quotes[:4]
        ]

        deliv_pct = signal.get("delivery_pct")
        confluence_verdict = signal.get("confluence_verdict")
        announcement = signal.get("latest_announcement") or {}

        # Fallback if no Gemini client
        if not self.client:
            return self._rule_based_synthesis(ticker, company_name, z_score, sent, divergence, headlines, signal_type, exact_quotes, deliv_pct, confluence_verdict, announcement)

        prompt = f"""
You are an expert Indian equities intelligence analyst evaluating social sentiment and exchange delivery confluence for NSE stock:
Ticker: {ticker}
Company Name: {company_name}
14-day Mention Z-Score: {z_score:+.2f} sigma
Engagement-Weighted Sentiment: {sent:+.2f} (-1.0 to +1.0)
Retail vs Deep-Dive Divergence: {divergence:+.2f}
Signal Category: {signal_type}
NSE Delivery Volume %: {deliv_pct}% (Above 45% = Institutional Accumulation, Below 28% = Day-Trader Churn)
Confluence Verdict: {confluence_verdict}
Latest Official NSE Regulatory Filing: {json.dumps(announcement)}
Sample Retail & Forum Headlines:
{json.dumps(headlines, indent=2)}
Verbatim Retail & Forum Quotations:
{json.dumps(quote_snippets, indent=2)}

Synthesize a professional, concise intelligence brief in JSON with the exact following schema:
{{
  "catalyst_summary": "2 clear sentences detailing what specific catalyst (official filing, order win, earnings, sector rally, or viral rumor) is driving chatter, confirming whether exchange delivery volume backs this up.",
  "retail_narrative": "What retail speculators on Reddit/Stocktwits/X are betting on.",
  "fundamental_divergence": "Analysis of whether long-term investors on ValuePickr and delivery figures agree, or if this is retail FOMO.",
  "risk_flags": ["List", "of", "1 to 3", "concise key risk warnings"],
  "radar_verdict": "A 3-word summary (e.g. 'Delivery-Backed Breakout', 'Speculative Hype Trap', 'Contrarian Value Dip')"
}}
"""
        try:
            response = self.client.generate_content(prompt, request_options={"timeout": 15})
            data = json.loads(response.text)
            return data
        except Exception as e:
            print(f"[synthesize] Gemini API error for {ticker}: {e}. Using deterministic synthesis.")
            return self._rule_based_synthesis(ticker, company_name, z_score, sent, divergence, headlines, signal_type, exact_quotes, deliv_pct, confluence_verdict, announcement)

    def _rule_based_synthesis(
        self,
        ticker: str,
        company_name: str,
        z_score: float,
        sent: float,
        divergence: float,
        headlines: List[str],
        signal_type: str,
        exact_quotes: Optional[List[Dict[str, Any]]] = None,
        deliv_pct: Optional[float] = None,
        confluence_verdict: Optional[str] = None,
        announcement: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Deterministic synthesis generator when running offline or without API quota."""
        catalyst = (
            f"Retail chatter in {company_name} ({ticker}) surged with a {z_score:+.1f}σ mention spike "
            f"and {('bullish' if sent > 0.15 else ('bearish' if sent < -0.15 else 'neutral'))} sentiment."
        )
        if announcement and announcement.get("desc"):
            catalyst += f" Official NSE Filing ({announcement.get('date', '')[:11].strip()}): \"{announcement.get('desc')}\"."
        
        if deliv_pct is not None:
            if deliv_pct >= 45.0:
                catalyst += f" High delivery ({deliv_pct}%) confirms genuine accumulation."
            elif deliv_pct < 28.0 and deliv_pct > 0:
                catalyst += f" Caution: Low delivery ({deliv_pct}%) indicates heavy speculative day-trading churn."

        if exact_quotes and len(exact_quotes) > 0:
            top_q = exact_quotes[0]
            catalyst += f" Quoted focus ({top_q.get('source')}): \"{top_q.get('quote')[:100]}...\""
        elif headlines:
            catalyst += f" Key theme: '{headlines[0]}'."

        retail_narrative = (
            "Retail momentum traders are targeting short-term breakout potential and speculative swings."
            if sent >= 0
            else "Retail participants are actively de-risking or expressing concern over recent price weakness."
        )

        fundamental_view = (
            "Deep-dive forum sentiment shows notable skepticism relative to retail hype, suggesting caution."
            if divergence > 0.3
            else (
                "Deep-dive investors appear to be accumulating on weakness while retail attention remains muted."
                if divergence < -0.3
                else "Retail and deep-dive sentiment are largely aligned."
            )
        )

        risks = []
        if z_score >= 2.0:
            risks.append("Elevated retail crowding (+2σ volume)")
        if divergence > 0.4:
            risks.append("Sharp retail-analyst sentiment divergence")
        if not risks:
            risks.append("Standard market & volatility risk")

        verdict = signal_type if signal_type != "Normal" else ("Retail Momentum" if sent > 0 else "Neutral Watch")

        return {
            "catalyst_summary": catalyst,
            "retail_narrative": retail_narrative,
            "fundamental_divergence": fundamental_view,
            "risk_flags": risks,
            "radar_verdict": verdict
        }

    def enrich_signals(self, signals: List[Dict[str, Any]], mapper_fn) -> List[Dict[str, Any]]:
        """Takes raw daily signals and enriches top items with synthesized briefs."""
        enriched = []
        for s in signals:
            item = dict(s)
            sym = item.get("ticker", "")
            company_name = mapper_fn(sym)
            item["company_name"] = company_name

            # Generate synthesis brief
            brief = self.synthesize_ticker(item, company_name)
            item["catalyst_summary"] = brief.get("catalyst_summary", "")
            item["risk_flags"] = list(set(item.get("risk_flags", []) + brief.get("risk_flags", [])))
            item["raw_synthesis"] = brief
            enriched.append(item)

        return enriched

if __name__ == "__main__":
    synth = BriefSynthesizer()
    dummy_signal = {
        "ticker": "TATAMOTORS",
        "mention_z_score": 3.12,
        "sentiment_score": 0.48,
        "retail_vs_analyst_divergence": 0.52,
        "signal_type": "Hype Spike",
        "sample_headlines": ["Tata Motors demerger date announced", "TaMo commercial vehicle EV roadmap looks strong"]
    }
    result = synth.synthesize_ticker(dummy_signal, "Tata Motors Limited")
    print("Synthesized brief:")
    print(json.dumps(result, indent=2))
