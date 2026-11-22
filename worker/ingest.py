"""
DalalPulse: Multi-Source Retail Sentiment Ingestor
Scrapes Reddit, ValuePickr Discourse, TradingQnA Discourse, and Stocktwits.
Stores posts in local DuckDB with automatic 30-day retention pruning.
"""

import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
import requests
import duckdb
from dotenv import load_dotenv

# Load environment
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

DEFAULT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "DalalPulse-Intelligence/1.0 (by /u/sumankaranam)")
DUCKDB_PATH = os.getenv("LOCAL_DUCKDB_PATH", "worker/data/local_cache.duckdb")

class DataIngestor:
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            # Resolve relative to repo root
            root = Path(__file__).resolve().parent.parent
            self.db_path = str(root / DUCKDB_PATH)
        else:
            self.db_path = db_path

        # Ensure directory exists
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_duckdb()

    def _get_connection(self):
        return duckdb.connect(self.db_path)

    def _init_duckdb(self):
        """Initializes tables and indexes in DuckDB."""
        conn = self._get_connection()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS scraped_posts (
                    id VARCHAR PRIMARY KEY,
                    source VARCHAR NOT NULL,
                    external_id VARCHAR,
                    author VARCHAR,
                    title VARCHAR,
                    body VARCHAR,
                    score INTEGER DEFAULT 0,
                    num_comments INTEGER DEFAULT 0,
                    created_utc TIMESTAMP,
                    url VARCHAR,
                    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_posts_created ON scraped_posts (created_utc);
                CREATE INDEX IF NOT EXISTS idx_posts_source ON scraped_posts (source);
            """)
        finally:
            conn.close()

    def prune_old_records(self, retention_days: int = 30):
        """Enforces SSD Hygiene by deleting records older than retention_days."""
        conn = self._get_connection()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
            conn.execute("DELETE FROM scraped_posts WHERE created_utc < ?", [cutoff])
            conn.execute("CHECKPOINT;")
            print(f"[ingest] Pruned local DuckDB cache older than {retention_days} days.")
        except Exception as e:
            print(f"[ingest] Error pruning DuckDB: {e}")
        finally:
            conn.close()

    def fetch_reddit(self, subreddits: List[str], limit: int = 50) -> List[Dict[str, Any]]:
        """Fetches posts from Reddit public JSON feeds."""
        posts = []
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }

        for sub in subreddits:
            url = f"https://www.reddit.com/r/{sub}/hot.json?limit={limit}"
            try:
                resp = requests.get(url, headers=headers, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    children = data.get("data", {}).get("children", [])
                    for item in children:
                        d = item.get("data", {})
                        pid = f"reddit_{d.get('id')}"
                        created_dt = datetime.fromtimestamp(d.get("created_utc", time.time()), tz=timezone.utc)
                        posts.append({
                            "id": pid,
                            "source": f"reddit_r_{sub.lower()}",
                            "external_id": d.get("id"),
                            "author": d.get("author", "anonymous"),
                            "title": d.get("title", ""),
                            "body": d.get("selftext", ""),
                            "score": int(d.get("score", 0)),
                            "num_comments": int(d.get("num_comments", 0)),
                            "created_utc": created_dt,
                            "url": f"https://reddit.com{d.get('permalink', '')}"
                        })
                else:
                    print(f"[ingest] Reddit r/{sub} returned HTTP {resp.status_code}")
            except Exception as e:
                print(f"[ingest] Failed to fetch Reddit r/{sub}: {e}")

        return posts

    def fetch_discourse(self, name: str, base_url: str) -> List[Dict[str, Any]]:
        """Fetches latest discussions from Discourse forums (ValuePickr / TradingQnA)."""
        posts = []
        headers = {"User-Agent": DEFAULT_USER_AGENT, "Accept": "application/json"}
        url = f"{base_url.rstrip('/')}/latest.json"

        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                topics = data.get("topic_list", {}).get("topics", [])
                for t in topics:
                    tid = str(t.get("id"))
                    pid = f"{name}_{tid}"
                    created_raw = t.get("created_at")
                    try:
                        created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                    except Exception:
                        created_dt = datetime.now(timezone.utc)

                    posts.append({
                        "id": pid,
                        "source": name,
                        "external_id": tid,
                        "author": str(t.get("last_poster_username", "contributor")),
                        "title": t.get("title", ""),
                        "body": t.get("excerpt", ""),
                        "score": int(t.get("like_count", 0)),
                        "num_comments": int(t.get("posts_count", 1)) - 1,
                        "created_utc": created_dt,
                        "url": f"{base_url.rstrip('/')}/t/{t.get('slug', '')}/{tid}"
                    })
            else:
                print(f"[ingest] {name} returned HTTP {resp.status_code}")
        except Exception as e:
            print(f"[ingest] Failed to fetch {name}: {e}")

        return posts

    def fetch_stocktwits(self) -> List[Dict[str, Any]]:
        """Fetches trending stream from Stocktwits."""
        posts = []
        headers = {"User-Agent": DEFAULT_USER_AGENT}
        url = "https://api.stocktwits.com/api/2/streams/trending.json"

        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                messages = data.get("messages", [])
                for msg in messages:
                    mid = str(msg.get("id"))
                    pid = f"stocktwits_{mid}"
                    created_raw = msg.get("created_at")
                    try:
                        created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                    except Exception:
                        created_dt = datetime.now(timezone.utc)

                    # Extract tagged symbols if present
                    symbols = [s.get("symbol") for s in msg.get("symbols", []) if s.get("symbol")]
                    sym_tag = f"[{', '.join(symbols)}] " if symbols else ""

                    user = msg.get("user", {})
                    posts.append({
                        "id": pid,
                        "source": "stocktwits",
                        "external_id": mid,
                        "author": user.get("username", "trader"),
                        "title": f"{sym_tag}{msg.get('body', '')[:80]}...",
                        "body": msg.get("body", ""),
                        "score": int(msg.get("likes", {}).get("total", 0)),
                        "num_comments": 0,
                        "created_utc": created_dt,
                        "url": f"https://stocktwits.com/{user.get('username', '')}/message/{mid}"
                    })
            else:
                print(f"[ingest] Stocktwits returned HTTP {resp.status_code}")
        except Exception as e:
            print(f"[ingest] Failed to fetch Stocktwits: {e}")

        return posts

    def save_posts(self, posts: List[Dict[str, Any]]) -> int:
        """Upserts scraped posts into DuckDB."""
        if not posts:
            return 0

        conn = self._get_connection()
        inserted_count = 0
        try:
            for p in posts:
                # Use insert or ignore on primary key collision
                conn.execute("""
                    INSERT OR IGNORE INTO scraped_posts 
                    (id, source, external_id, author, title, body, score, num_comments, created_utc, url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    p["id"], p["source"], p["external_id"], p["author"],
                    p["title"], p["body"], p["score"], p["num_comments"],
                    p["created_utc"], p["url"]
                ])
                inserted_count += 1
            conn.execute("CHECKPOINT;")
        finally:
            conn.close()

        return inserted_count

    def ingest_all(
        self,
        subreddits: Optional[List[str]] = None,
        include_valuepickr: bool = True,
        include_tradingqna: bool = True,
        include_stocktwits: bool = True
    ) -> int:
        """Runs full ingestion across all configured sources."""
        all_posts = []

        # 1. Reddit
        subs = subreddits or ["IndianStreetBets", "IndiaInvestments", "DalalStreetTalks"]
        print(f"[ingest] Fetching Reddit subreddits: {subs}...")
        reddit_posts = self.fetch_reddit(subs)
        all_posts.extend(reddit_posts)
        print(f"[ingest] Retrieved {len(reddit_posts)} posts from Reddit.")

        # 2. ValuePickr
        if include_valuepickr:
            print("[ingest] Fetching ValuePickr topics...")
            vp_posts = self.fetch_discourse("valuepickr", "https://forum.valuepickr.com")
            all_posts.extend(vp_posts)
            print(f"[ingest] Retrieved {len(vp_posts)} topics from ValuePickr.")

        # 3. TradingQnA
        if include_tradingqna:
            print("[ingest] Fetching TradingQnA topics...")
            tq_posts = self.fetch_discourse("tradingqna", "https://tradingqna.com")
            all_posts.extend(tq_posts)
            print(f"[ingest] Retrieved {len(tq_posts)} topics from TradingQnA.")

        # 4. Stocktwits
        if include_stocktwits:
            print("[ingest] Fetching Stocktwits messages...")
            st_posts = self.fetch_stocktwits()
            all_posts.extend(st_posts)
            print(f"[ingest] Retrieved {len(st_posts)} messages from Stocktwits.")

        saved = self.save_posts(all_posts)
        print(f"[ingest] Saved {saved} total posts into local DuckDB.")

        # Clean old records
        self.prune_old_records(retention_days=30)
        return saved

    def get_posts_df(self, days: int = 14, since: Optional[datetime] = None):
        """Retrieves posts within the last N days or since a specific timestamp as a pandas DataFrame."""
        conn = self._get_connection()
        try:
            if since:
                df = conn.execute(
                    "SELECT * FROM scraped_posts WHERE scraped_at >= ? OR created_utc >= ? ORDER BY scraped_at DESC",
                    [since, since]
                ).fetchdf()
            else:
                cutoff = datetime.now(timezone.utc) - timedelta(days=days)
                df = conn.execute(
                    "SELECT * FROM scraped_posts WHERE created_utc >= ? ORDER BY created_utc DESC",
                    [cutoff]
                ).fetchdf()
            return df
        finally:
            conn.close()

if __name__ == "__main__":
    ingestor = DataIngestor()
    print("DuckDB initialized at:", ingestor.db_path)
    df = ingestor.get_posts_df(days=14)
    print(f"Current posts in local DuckDB: {len(df)}")
