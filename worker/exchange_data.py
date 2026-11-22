"""
DalalPulse: NSE Exchange Data & Confluence Engine
Fetches authoritative delivery volume % and price action from NSE Bhavcopy,
pulls official corporate announcements from NSE, and computes multi-signal confluences.
"""

import io
import re
import requests
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

class ExchangeDataEngine:
    def __init__(self):
        self.headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.nseindia.com/"
        }
        self._cached_bhavcopy: Optional[Dict[str, Dict[str, Any]]] = None
        self._bhavcopy_date: Optional[str] = None

    def fetch_latest_bhavcopy(self, days_back: int = 7) -> Dict[str, Dict[str, Any]]:
        """
        Downloads and parses the most recent available NSE daily security delivery bhavcopy.
        Caches in-memory so multiple calls in one run do not re-download.
        """
        if self._cached_bhavcopy is not None:
            return self._cached_bhavcopy

        now = datetime.now()
        data_map: Dict[str, Dict[str, Any]] = {}

        for i in range(0, days_back):
            check_date = now - timedelta(days=i)
            # Skip if Sunday (optional, but harmless to try)
            date_str = check_date.strftime("%d%m%Y")
            url = f"https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{date_str}.csv"
            
            try:
                resp = requests.get(url, headers=self.headers, timeout=8)
                if resp.status_code == 200 and "SYMBOL" in resp.text:
                    self._bhavcopy_date = check_date.strftime("%Y-%m-%d")
                    print(f"[exchange_data] Downloaded NSE Bhavcopy for {self._bhavcopy_date} ({date_str}).")
                    
                    df = pd.read_csv(io.StringIO(resp.text))
                    df.columns = [c.strip() for c in df.columns]
                    
                    # Keep EQ series primarily
                    if 'SERIES' in df.columns:
                        df['SERIES'] = df['SERIES'].astype(str).str.strip()
                        df = df[df['SERIES'] == 'EQ']
                    
                    for _, row in df.iterrows():
                        sym = str(row.get('SYMBOL', '')).strip().upper()
                        if not sym:
                            continue
                        
                        try:
                            close_p = float(str(row.get('CLOSE_PRICE', 0)).strip())
                            prev_p = float(str(row.get('PREV_CLOSE', 0)).strip())
                            pct_chg = round(((close_p - prev_p) / prev_p) * 100, 2) if prev_p > 0 else 0.0
                            
                            traded_q_str = str(row.get('TTL_TRD_QNTY', 0)).strip()
                            traded_q = int(traded_q_str) if traded_q_str not in ('-', '', 'nan') else 0
                            
                            deliv_q_str = str(row.get('DELIV_QTY', 0)).strip()
                            deliv_q = int(deliv_q_str) if deliv_q_str not in ('-', '', 'nan') else 0
                            
                            deliv_p_str = str(row.get('DELIV_PER', 0)).strip()
                            deliv_pct = float(deliv_p_str) if deliv_p_str not in ('-', '', 'nan') else 0.0
                            
                            data_map[sym] = {
                                "close_price": close_p,
                                "prev_close": prev_p,
                                "price_change_pct": pct_chg,
                                "traded_qty": traded_q,
                                "delivery_qty": deliv_q,
                                "delivery_pct": deliv_pct,
                                "bhavcopy_date": self._bhavcopy_date
                            }
                        except Exception:
                            continue
                            
                    self._cached_bhavcopy = data_map
                    return data_map
            except Exception as e:
                # Try previous day
                continue

        print("[exchange_data] Warning: Could not download NSE Bhavcopy within lookback.")
        self._cached_bhavcopy = {}
        return {}

    def fetch_corporate_announcement(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetches the latest official corporate regulatory filing from NSE for a specific ticker.
        """
        sym = symbol.strip().upper()
        url = f"https://www.nseindia.com/api/corporate-announcements?index=equities&symbol={sym}"
        try:
            resp = requests.get(url, headers=self.headers, timeout=6)
            if resp.status_code == 200:
                anns = resp.json()
                if isinstance(anns, list) and len(anns) > 0:
                    top = anns[0]
                    return {
                        "desc": top.get("desc", ""),
                        "details": top.get("attchmntText", "") or top.get("desc", ""),
                        "file_url": top.get("attchmntFile", ""),
                        "date": top.get("an_dt", "") or top.get("sort_date", "")
                    }
        except Exception as e:
            # Silently fallback
            pass
        return None

    def evaluate_confluence(
        self,
        ticker: str,
        mention_z_score: float,
        sentiment_score: float,
        retail_vs_analyst_divergence: float,
        delivery_info: Optional[Dict[str, Any]],
        announcement: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Evaluates confluence between retail social sentiment and exchange delivery/filings.
        """
        flags: List[str] = []
        verdict = "Normal Flow"

        deliv_pct = delivery_info.get("delivery_pct", 0.0) if delivery_info else 0.0
        chg_pct = delivery_info.get("price_change_pct", 0.0) if delivery_info else 0.0

        # Delivery signals
        if deliv_pct >= 50.0:
            flags.append(f"Strong Hand Accumulation ({deliv_pct}% Delivery)")
        elif deliv_pct < 28.0 and deliv_pct > 0:
            flags.append(f"Speculative Day-Trading Churn ({deliv_pct}% Delivery)")

        # Price momentum flag
        if chg_pct >= 2.5:
            flags.append(f"Price Breakout ({chg_pct:+0.2f}%)")
        elif chg_pct <= -2.5:
            flags.append(f"Price Pullback ({chg_pct:+0.2f}%)")

        # Official corporate announcement
        has_recent_filing = False
        if announcement and announcement.get("desc"):
            desc = announcement.get("desc")
            flags.append(f"NSE Filing: {desc[:35]}")
            has_recent_filing = True

        # Confluence Verdict Rules:
        # 1. Delivery Breakout: High retail buzz + High Delivery % + Positive Sentiment
        if (mention_z_score >= 2.0 or sentiment_score > 0.15) and deliv_pct >= 45.0:
            verdict = "Delivery-Confirmed Breakout"

        # 2. Retail FOMO Trap: High retail buzz + Low Delivery % (<28%)
        elif mention_z_score >= 2.0 and deliv_pct > 0 and deliv_pct < 28.0:
            verdict = "Retail Distribution Trap"

        # 3. Silent Institutional Accumulation: Low/medium social hype + Very High Delivery (>55%)
        elif mention_z_score < 1.5 and deliv_pct >= 55.0:
            verdict = "Silent Institutional Accumulation"

        # 4. Official Catalyst Confirmed: High hype with recent official exchange filing
        elif mention_z_score >= 2.0 and has_recent_filing:
            verdict = "Corporate Action Confirmed"

        # 5. Contrarian Dip: Negative retail sentiment + High delivery or neutral price
        elif sentiment_score < -0.15 and deliv_pct >= 45.0:
            verdict = "Contrarian Value Accumulation"

        # 6. Unverified Rumor: High hype with no official exchange filings
        elif mention_z_score >= 2.5 and not has_recent_filing:
            verdict = "Unverified Social Hype"

        return {
            "confluence_verdict": verdict,
            "confluence_flags": flags
        }

if __name__ == "__main__":
    engine = ExchangeDataEngine()
    bhav = engine.fetch_latest_bhavcopy()
    print(f"Total symbols loaded in Bhavcopy: {len(bhav)}")
    
    test_tickers = ["PERSISTENT", "CYIENT", "RELIANCE", "IDFCFIRSTB"]
    for t in test_tickers:
        d = bhav.get(t, {})
        ann = engine.fetch_corporate_announcement(t)
        res = engine.evaluate_confluence(
            ticker=t,
            mention_z_score=10.2,
            sentiment_score=0.18,
            retail_vs_analyst_divergence=0.1,
            delivery_info=d,
            announcement=ann
        )
        print(f"\n--- {t} ---")
        print(f"Delivery: {d.get('delivery_pct')}% | Price: ₹{d.get('close_price')} ({d.get('price_change_pct')}%)")
        print(f"Announcement: {ann.get('desc') if ann else 'None'}")
        print(f"Verdict: {res['confluence_verdict']}")
        print(f"Flags: {res['confluence_flags']}")
