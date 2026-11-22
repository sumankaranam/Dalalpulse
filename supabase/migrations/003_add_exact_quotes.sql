-- Migration 003: Add exact_quotes column to daily_signals and new sources to pipeline_config
ALTER TABLE daily_signals 
ADD COLUMN IF NOT EXISTS exact_quotes JSONB DEFAULT '[]'::JSONB;

ALTER TABLE pipeline_config
ADD COLUMN IF NOT EXISTS moneycontrol_enabled BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS x_twitter_enabled BOOLEAN NOT NULL DEFAULT TRUE;
