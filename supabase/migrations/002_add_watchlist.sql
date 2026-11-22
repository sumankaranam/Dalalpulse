-- Add watchlist_tickers and radar_mode to pipeline_config
ALTER TABLE pipeline_config 
ADD COLUMN IF NOT EXISTS watchlist_tickers TEXT[] NOT NULL DEFAULT ARRAY['RELIANCE', 'TATAMOTORS', 'HDFCBANK', 'INFY', 'ZOMATO', 'SUZLON', 'IRFC']::TEXT[],
ADD COLUMN IF NOT EXISTS radar_mode VARCHAR(30) NOT NULL DEFAULT 'all_radar';

UPDATE pipeline_config 
SET watchlist_tickers = ARRAY['RELIANCE', 'TATAMOTORS', 'HDFCBANK', 'INFY', 'ZOMATO', 'SUZLON', 'IRFC']::TEXT[],
    radar_mode = 'all_radar'
WHERE id = 1;
