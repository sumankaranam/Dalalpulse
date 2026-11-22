import os
import sys
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Find and load .env from current or parent directories
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = Any

class PipelineConfig(BaseModel):
    id: int = 1
    trigger_immediate_run: bool = False
    min_mention_threshold: int = 5
    z_score_threshold: float = 2.0
    subreddits: List[str] = Field(
        default_factory=lambda: ["IndianStreetBets", "IndiaInvestments", "DalalStreetTalks"]
    )
    valuepickr_enabled: bool = True
    tradingqna_enabled: bool = True
    stocktwits_enabled: bool = True
    telegram_notifications: bool = False
    max_synthesize_tickers: int = 10
    updated_at: Optional[datetime] = None

class SupabaseSync:
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        # Prefer secret / service role key for worker writes, fallback to publishable/anon
        self.supabase_key = (
            os.getenv("SUPABASE_SECRET_KEY")
            or os.getenv("SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        )
        self.client: Optional[Client] = None
        if self.supabase_url and self.supabase_key and create_client is not None:
            try:
                self.client = create_client(self.supabase_url, self.supabase_key)
            except Exception as e:
                print(f"[config_sync] Warning: Could not initialize Supabase client: {e}")

    def fetch_config(self) -> PipelineConfig:
        """Fetches remote configuration or falls back to robust defaults."""
        default_config = PipelineConfig()
        if not self.client:
            print("[config_sync] Supabase not connected. Using local default configuration.")
            return default_config

        try:
            res = self.client.table("pipeline_config").select("*").eq("id", 1).execute()
            if res.data and len(res.data) > 0:
                row = res.data[0]
                return PipelineConfig(**row)
        except Exception as e:
            print(f"[config_sync] Error fetching config from Supabase: {e}. Falling back to default.")

        return default_config

    def reset_immediate_trigger(self) -> bool:
        """Resets trigger_immediate_run back to False after triggering."""
        if not self.client:
            return False
        try:
            self.client.table("pipeline_config").update({"trigger_immediate_run": False}).eq("id", 1).execute()
            return True
        except Exception as e:
            print(f"[config_sync] Error resetting trigger_immediate_run: {e}")
            return False

    def push_signals(self, signals: List[Dict[str, Any]]) -> bool:
        """Inserts generated daily signals into Supabase."""
        if not self.client or not signals:
            return False
        try:
            self.client.table("daily_signals").insert(signals).execute()
            print(f"[config_sync] Successfully pushed {len(signals)} signals to Supabase.")
            return True
        except Exception as e:
            print(f"[config_sync] Error inserting signals into Supabase: {e}")
            return False

    def create_run_log(self, trigger_source: str = "scheduled") -> Optional[str]:
        """Creates initial execution telemetry log."""
        if not self.client:
            return None
        try:
            res = self.client.table("run_logs").insert({
                "status": "running",
                "trigger_source": trigger_source,
                "logs": f"Execution started at {datetime.now().isoformat()}"
            }).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]["id"]
        except Exception as e:
            print(f"[config_sync] Error creating run_log: {e}")
        return None

    def update_run_log(
        self,
        run_id: Optional[str],
        status: str,
        posts_scraped: int = 0,
        tickers_detected: int = 0,
        signals_generated: int = 0,
        gpu_vram_peak_mb: float = 0.0,
        duration_seconds: float = 0.0,
        logs: str = "",
        error_message: Optional[str] = None
    ):
        """Updates run_log row with final telemetry."""
        if not self.client or not run_id:
            return
        try:
            payload = {
                "status": status,
                "completed_at": datetime.now().isoformat(),
                "posts_scraped": posts_scraped,
                "tickers_detected": tickers_detected,
                "signals_generated": signals_generated,
                "gpu_vram_peak_mb": gpu_vram_peak_mb,
                "duration_seconds": duration_seconds,
                "logs": logs,
                "error_message": error_message
            }
            self.client.table("run_logs").update(payload).eq("id", run_id).execute()
        except Exception as e:
            print(f"[config_sync] Error updating run_log: {e}")

if __name__ == "__main__":
    sync = SupabaseSync()
    cfg = sync.fetch_config()
    print("Loaded config:", cfg.model_dump())
