-- DalalPulse: Schema Migration 001
-- Tables: pipeline_config, daily_signals, run_logs with RLS policies

-- 1. Pipeline Configuration Table (Remote control plane)
CREATE TABLE IF NOT EXISTS pipeline_config (
    id SERIAL PRIMARY KEY,
    trigger_immediate_run BOOLEAN NOT NULL DEFAULT FALSE,
    min_mention_threshold INT NOT NULL DEFAULT 5,
    z_score_threshold NUMERIC(4,2) NOT NULL DEFAULT 2.00,
    subreddits TEXT[] NOT NULL DEFAULT ARRAY['IndianStreetBets', 'IndiaInvestments', 'DalalStreetTalks'],
    valuepickr_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    tradingqna_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    stocktwits_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    telegram_notifications BOOLEAN NOT NULL DEFAULT FALSE,
    max_synthesize_tickers INT NOT NULL DEFAULT 10,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure a default singleton row exists
INSERT INTO pipeline_config (id, trigger_immediate_run, min_mention_threshold, z_score_threshold, telegram_notifications)
VALUES (1, FALSE, 5, 2.00, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 2. Daily Signals Table
CREATE TABLE IF NOT EXISTS daily_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    ticker VARCHAR(32) NOT NULL,
    company_name VARCHAR(255),
    mention_count INT NOT NULL DEFAULT 0,
    mention_z_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    sentiment_score NUMERIC(4,3) NOT NULL DEFAULT 0.000, -- -1.000 to +1.000
    sentiment_label VARCHAR(20) NOT NULL DEFAULT 'Neutral', -- Bullish, Bearish, Neutral
    retail_vs_analyst_divergence NUMERIC(4,3) DEFAULT 0.000,
    signal_type VARCHAR(50) DEFAULT 'Normal', -- Hype Spike, Contrarian Dip, Deep Dive Accumulation, Retail FOMO
    catalyst_summary TEXT,
    risk_flags TEXT[] DEFAULT ARRAY[]::TEXT[],
    sources_breakdown JSONB DEFAULT '{}'::JSONB, -- {reddit: 12, valuepickr: 3, tradingqna: 1, stocktwits: 15}
    sample_headlines TEXT[] DEFAULT ARRAY[]::TEXT[],
    raw_synthesis JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_signals_run_date ON daily_signals (run_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_signals_ticker ON daily_signals (ticker);
CREATE INDEX IF NOT EXISTS idx_daily_signals_z_score ON daily_signals (mention_z_score DESC);

-- 3. Execution Telemetry / Run Logs Table
CREATE TABLE IF NOT EXISTS run_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'running', -- running, success, failed
    posts_scraped INT DEFAULT 0,
    tickers_detected INT DEFAULT 0,
    signals_generated INT DEFAULT 0,
    gpu_vram_peak_mb NUMERIC(7,2) DEFAULT 0.00,
    duration_seconds NUMERIC(6,2),
    trigger_source VARCHAR(30) DEFAULT 'scheduled', -- scheduled, manual_web, manual_cli
    logs TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_logs_created_at ON run_logs (created_at DESC);

-- Row Level Security (RLS) Setup
ALTER TABLE pipeline_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_logs ENABLE ROW LEVEL SECURITY;

-- Allow public / anon read access so mobile web app can inspect signals and logs
CREATE POLICY "Allow public read pipeline_config" 
    ON pipeline_config FOR SELECT 
    USING (true);

CREATE POLICY "Allow public read daily_signals" 
    ON daily_signals FOR SELECT 
    USING (true);

CREATE POLICY "Allow public read run_logs" 
    ON run_logs FOR SELECT 
    USING (true);

-- Allow authenticated users or anon with secret to trigger runs / update config from PWA
CREATE POLICY "Allow update pipeline_config" 
    ON pipeline_config FOR UPDATE 
    USING (true)
    WITH CHECK (true);

-- Allow service_role to perform all operations
CREATE POLICY "Allow service_role full access pipeline_config" 
    ON pipeline_config TO service_role 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Allow service_role full access daily_signals" 
    ON daily_signals TO service_role 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Allow service_role full access run_logs" 
    ON run_logs TO service_role 
    USING (true) 
    WITH CHECK (true);
