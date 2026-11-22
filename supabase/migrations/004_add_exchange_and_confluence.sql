-- Migration 004: Add delivery %, price action, official announcements and confluence verdicts to daily_signals
ALTER TABLE daily_signals 
ADD COLUMN IF NOT EXISTS delivery_pct NUMERIC(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS delivery_qty BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS traded_qty BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS close_price NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS price_change_pct NUMERIC(6,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS latest_announcement JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS confluence_verdict TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS confluence_flags JSONB DEFAULT '[]'::JSONB;
