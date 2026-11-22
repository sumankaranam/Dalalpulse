export interface ForumQuote {
  source: string;
  author: string;
  quote: string;
  title?: string;
  url: string;
  score?: number;
  created_at?: string;
}

export interface DailySignal {
  id: string;
  run_date: string;
  ticker: string;
  company_name: string;
  mention_count: number;
  mention_z_score: number;
  sentiment_score: number;
  sentiment_label: 'Bullish' | 'Bearish' | 'Neutral';
  retail_vs_analyst_divergence: number;
  signal_type: string;
  catalyst_summary: string;
  risk_flags: string[];
  sources_breakdown: Record<string, number>;
  sample_headlines: string[];
  exact_quotes?: ForumQuote[];
  delivery_pct?: number;
  delivery_qty?: number;
  traded_qty?: number;
  close_price?: number;
  price_change_pct?: number;
  latest_announcement?: {
    desc?: string;
    details?: string;
    file_url?: string;
    date?: string;
  };
  confluence_verdict?: string;
  confluence_flags?: string[];
  raw_synthesis?: {
    catalyst_summary?: string;
    retail_narrative?: string;
    fundamental_divergence?: string;
    risk_flags?: string[];
    radar_verdict?: string;
  };
  created_at: string;
}

export interface PipelineConfig {
  id: number;
  trigger_immediate_run: boolean;
  min_mention_threshold: number;
  z_score_threshold: number;
  subreddits: string[];
  valuepickr_enabled: boolean;
  tradingqna_enabled: boolean;
  stocktwits_enabled: boolean;
  moneycontrol_enabled?: boolean;
  x_twitter_enabled?: boolean;
  telegram_notifications: boolean;
  max_synthesize_tickers: number;
  watchlist_tickers: string[];
  radar_mode: 'all_radar' | 'watchlist_only';
  updated_at?: string;
}

export interface RunLog {
  id: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'success' | 'failed';
  posts_scraped: number;
  tickers_detected: number;
  signals_generated: number;
  gpu_vram_peak_mb: number;
  duration_seconds: number;
  trigger_source: string;
  logs?: string;
  error_message?: string;
  created_at: string;
}
