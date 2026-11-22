"""
DalalPulse: Lightweight Background Watcher
Polls Supabase pipeline_config every 60s for trigger_immediate_run == True.
When triggered by the mobile PWA, immediately runs the pipeline and resets the trigger.
"""

import time
import os
import sys
from pathlib import Path
from datetime import datetime

# Add current dir to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config_sync import SupabaseSync
from pipeline import run_pipeline

POLL_INTERVAL_SECONDS = int(os.getenv("WATCHER_POLL_INTERVAL", "60"))

def start_watcher():
    print(f"👀 DalalPulse Watcher active. Polling Supabase every {POLL_INTERVAL_SECONDS}s...")
    sync = SupabaseSync()

    while True:
        try:
            config = sync.fetch_config()
            if config.trigger_immediate_run:
                print(f"\n⚡ Immediate run requested via Cloud Control Plane at {datetime.now().isoformat()}!")
                # Reset trigger first to prevent double-firing
                sync.reset_immediate_trigger()
                # Execute pipeline
                run_pipeline(trigger_source="manual_web")
                print(f"✅ On-demand pipeline completed. Resuming polling...")
        except Exception as e:
            print(f"[watcher] Error during poll cycle: {e}")

        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    try:
        start_watcher()
    except KeyboardInterrupt:
        print("\nWatcher stopped by user.")
