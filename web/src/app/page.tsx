"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  TrendingUp, TrendingDown, Minus, Flame, AlertTriangle, 
  MessageSquare, ExternalLink, RefreshCw, ChevronDown, ChevronUp, Quote,
  Star, Globe, Search, Zap, Sliders, CheckCircle2, Clock, Activity, AlertCircle,
  Building2, PackageCheck, ShieldAlert, Layers
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DailySignal, RunLog } from "@/types";

export default function RadarPage() {
  const [signals, setSignals] = useState<DailySignal[]>([]);
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([
    "RELIANCE", "PERSISTENT", "IDFCFIRSTB", "ELGIEQUIP", "CYIENT", "ZEEL", "LATENTVIEW"
  ]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"watchlist" | "market">("watchlist");
  const [marketFilter, setMarketFilter] = useState<"all" | "delivery_breakout" | "distribution_trap" | "official_filing" | "hype" | "bullish" | "divergent">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [triggeringMode, setTriggeringMode] = useState<string | null>(null);
  const [triggerNotice, setTriggerNotice] = useState<string | null>(null);
  
  // Real-time run tracking
  const [latestRun, setLatestRun] = useState<RunLog | null>(null);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);

  const fetchSignalsAndConfig = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      // 1. Fetch Signals
      const { data: signalData, error: signalErr } = await supabase
        .from("daily_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);

      if (!signalErr && signalData) {
        // Deduplicate to newest run per ticker
        const seen = new Set<string>();
        const uniqueSignals: DailySignal[] = [];
        for (const s of signalData) {
          if (!seen.has(s.ticker)) {
            seen.add(s.ticker);
            uniqueSignals.push(s as DailySignal);
          }
        }
        setSignals(uniqueSignals);
      }

      // 2. Fetch Config for Watchlist Tickers
      const { data: cfgData, error: cfgErr } = await supabase
        .from("pipeline_config")
        .select("watchlist_tickers, radar_mode")
        .eq("id", 1)
        .single();

      if (!cfgErr && cfgData?.watchlist_tickers) {
        setWatchlistTickers(cfgData.watchlist_tickers);
      }

      // 3. Fetch Latest Run Telemetry
      const { data: runData, error: runErr } = await supabase
        .from("run_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .single();

      if (!runErr && runData) {
        setLatestRun(runData as RunLog);
        setIsPipelineRunning(runData.status === "running");
      }
    } catch (err) {
      console.error("Error fetching signals/config:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignalsAndConfig();
    const interval = setInterval(fetchSignalsAndConfig, 25000); // 25s auto-refresh
    return () => clearInterval(interval);
  }, []);

  // Fast polling while pipeline is running
  useEffect(() => {
    if (!isPipelineRunning) return;
    const pollTimer = setInterval(async () => {
      if (!supabase) return;
      try {
        const { data: runData } = await supabase
          .from("run_logs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (runData) {
          setLatestRun(runData as RunLog);
          if (runData.status !== "running") {
            setIsPipelineRunning(false);
            // Refresh data upon run completion
            fetchSignalsAndConfig();
          }
        }
      } catch (err) {
        console.error("Error polling run_logs:", err);
      }
    }, 3000);

    return () => clearInterval(pollTimer);
  }, [isPipelineRunning]);

  const triggerRun = async (mode: 'watchlist_only' | 'all_radar', targetTicker?: string) => {
    if (!supabase || triggeringMode) return;
    const modeKey = targetTicker || mode;
    setTriggeringMode(modeKey);
    setIsPipelineRunning(true);
    try {
      await supabase
        .from("pipeline_config")
        .update({
          trigger_immediate_run: true,
          radar_mode: mode,
          updated_at: new Date().toISOString()
        })
        .eq("id", 1);

      setTriggerNotice(
        targetTicker 
          ? `⚡ Worker triggered for ${targetTicker}! Pulling NSE Delivery %, Filings, Forum & X posts...` 
          : mode === 'watchlist_only'
          ? `⚡ Radar run queued with NSE Delivery & Filings for your ${watchlistTickers.length} Watchlist stocks!`
          : "🌐 Full Market Scan queued across 2,600+ NSE stocks!"
      );
      setTimeout(() => setTriggerNotice(null), 8000);
    } catch (err) {
      console.error("Trigger error:", err);
    } finally {
      setTriggeringMode(null);
    }
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  const watchlistSet = new Set(watchlistTickers.map((t) => t.toUpperCase().trim()));

  // Filter signals according to active view & search query
  const displayedSignals = signals.filter((s) => {
    const sym = s.ticker.toUpperCase();
    const name = (s.company_name || "").toLowerCase();
    const query = searchQuery.trim().toLowerCase();

    // Search query match
    if (query && !sym.toLowerCase().includes(query) && !name.includes(query)) {
      return false;
    }

    if (activeView === "watchlist") {
      return watchlistSet.has(sym) || s.risk_flags?.includes("Watchlist Priority");
    }

    // In market view
    if (marketFilter === "delivery_breakout") return (s.delivery_pct || 0) >= 45.0 && s.sentiment_score > 0;
    if (marketFilter === "distribution_trap") return (s.delivery_pct || 0) > 0 && (s.delivery_pct || 0) < 28.0;
    if (marketFilter === "official_filing") return !!(s.latest_announcement && s.latest_announcement.desc);
    if (marketFilter === "hype") return s.mention_z_score >= 2.0;
    if (marketFilter === "bullish") return s.sentiment_score > 0.15;
    if (marketFilter === "divergent") return Math.abs(s.retail_vs_analyst_divergence) > 0.4;
    return true;
  });

  // Identify watchlist tickers that don't have active signals yet
  const activeWatchlistSymbols = new Set(
    signals.filter((s) => watchlistSet.has(s.ticker.toUpperCase())).map((s) => s.ticker.toUpperCase())
  );
  const pendingWatchlistTickers = watchlistTickers.filter(
    (t) => !activeWatchlistSymbols.has(t.toUpperCase()) &&
      (!searchQuery || t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const topZ = signals.length > 0 ? signals[0] : null;
  const avgSentiment = signals.length > 0
    ? (signals.reduce((acc, s) => acc + s.sentiment_score, 0) / signals.length).toFixed(2)
    : "0.00";

  return (
    <div className="space-y-4">
      {/* Overview Metric Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#121826] border border-radar-border p-3.5 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Top Momentum</span>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-lg font-bold text-sky-400">{topZ?.ticker || "—"}</span>
            {topZ && (
              <span className="text-xs font-semibold text-emerald-400">+{topZ.mention_z_score}σ</span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 truncate block mt-0.5">{topZ?.company_name || "Awaiting run"}</span>
        </div>

        <div className="bg-[#121826] border border-radar-border p-3.5 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Avg Sentiment</span>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className={`text-lg font-bold ${Number(avgSentiment) > 0 ? 'text-emerald-400' : Number(avgSentiment) < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {avgSentiment}
            </span>
            <span className="text-[11px] text-slate-400">(-1 to +1)</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Across active radar</span>
        </div>

        <div className="bg-[#121826] border border-radar-border p-3.5 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Watchlist Equities</span>
          <div className="text-lg font-bold text-amber-400 mt-1">{watchlistTickers.length}</div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Personal stock radar</span>
        </div>

        <div className="bg-[#121826] border border-radar-border p-3.5 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Exchange Confluence</span>
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-400 mt-2">
            <PackageCheck className="w-4 h-4 text-emerald-400" />
            <span>NSE Delivery Synced</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Bhavcopy + Filings Active</span>
        </div>
      </div>

      {/* Real-time Execution Banner */}
      {isPipelineRunning ? (
        <div className="bg-sky-950/70 border border-sky-500/60 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-sky-950/30">
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
              <span className="absolute w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-sky-200">Radar Pipeline Active — Processing Live</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-sky-900/80 border border-sky-600/50 text-sky-300 font-mono">
                  RTX 4050 GPU
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Ingesting Reddit, X, Moneycontrol, ValuePickr → NSE Delivery % & Filings → FinBERT scoring...
              </p>
            </div>
          </div>
          <div className="text-right flex items-center sm:block space-x-2 sm:space-x-0">
            <span className="text-[11px] text-slate-400">Trigger: {latestRun?.trigger_source || "Web"}</span>
            <span className="text-[10px] text-sky-400 font-mono font-medium block">Auto-updating screen...</span>
          </div>
        </div>
      ) : latestRun ? (
        <div className="bg-[#121826]/90 border border-radar-border rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2 text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              Last Radar Run: <strong className="text-white">{formatDateTime(latestRun.completed_at || latestRun.started_at)}</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">{latestRun.signals_generated} signals generated</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">{latestRun.posts_scraped} posts scraped</span>
            {latestRun.duration_seconds && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">{Math.round(latestRun.duration_seconds)}s execution</span>
              </>
            )}
          </div>
          <button
            onClick={() => fetchSignalsAndConfig()}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-[11px] text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh View</span>
          </button>
        </div>
      ) : null}

      {/* Trigger Feedback Toast */}
      {triggerNotice && (
        <div className="bg-sky-950/80 border border-sky-500/60 text-sky-200 p-3 rounded-xl flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span className="font-medium">{triggerNotice}</span>
          </div>
          <span className="text-[10px] text-slate-400">Worker polling...</span>
        </div>
      )}

      {/* Primary View Switcher: Watchlist vs Market */}
      <div className="bg-[#121826] border border-radar-border p-1.5 rounded-xl flex items-center space-x-1">
        <button
          onClick={() => { setActiveView("watchlist"); setSearchQuery(""); }}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-bold transition-all ${
            activeView === "watchlist"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${activeView === "watchlist" ? "fill-amber-400 text-amber-400" : ""}`} />
          <span>⭐ My Watchlist Only ({watchlistTickers.length})</span>
        </button>

        <button
          onClick={() => { setActiveView("market"); setSearchQuery(""); }}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-bold transition-all ${
            activeView === "market"
              ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          <span>🌐 Whole Market Discovery ({signals.length})</span>
        </button>
      </div>

      {/* Search & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              activeView === "watchlist"
                ? "Filter your watchlist (e.g. PERSISTENT, IDFCFIRSTB, RELIANCE)..."
                : "Search any NSE stock across market results..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121826] border border-radar-border rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-[11px]"
            >
              Clear
            </button>
          )}
        </div>

        {/* View-Specific Run Buttons */}
        <div className="flex items-center space-x-2">
          {activeView === "watchlist" ? (
            <>
              <button
                onClick={() => triggerRun("watchlist_only")}
                disabled={isPipelineRunning || !!triggeringMode}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold active:scale-95 transition-all disabled:opacity-60"
              >
                {isPipelineRunning && triggeringMode === "watchlist_only" ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Running Watchlist...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Run Watchlist Only</span>
                  </>
                )}
              </button>

              <Link
                href="/settings"
                className="p-2 rounded-xl bg-[#121826] border border-radar-border text-slate-400 hover:text-slate-200 transition-colors"
                title="Manage Watchlist Stocks"
              >
                <Sliders className="w-4 h-4" />
              </Link>
            </>
          ) : (
            <button
              onClick={() => triggerRun("all_radar")}
              disabled={isPipelineRunning || !!triggeringMode}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/40 text-sky-300 text-xs font-semibold active:scale-95 transition-all disabled:opacity-60"
            >
              {isPipelineRunning && triggeringMode === "all_radar" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning Market...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>Run Full Market Scan</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Sub-Filters for Market View */}
      {activeView === "market" && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { key: "all", label: "All Tickers" },
            { key: "delivery_breakout", label: "🔥 Delivery Breakout (≥45%)" },
            { key: "distribution_trap", label: "⚠️ Distribution Trap (<28%)" },
            { key: "official_filing", label: "🏛️ Official NSE Filings" },
            { key: "hype", label: "📈 Hype Spikes (≥2σ)" },
            { key: "bullish", label: "🟢 Bullish" },
            { key: "divergent", label: "⚡ Persona Divergence" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMarketFilter(tab.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                marketFilter === tab.key
                  ? "bg-sky-500 text-slate-950 font-semibold shadow-sm"
                  : "bg-[#121826] text-slate-400 hover:text-slate-200 border border-radar-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Signals List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 bg-[#121826]/60 border border-radar-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : displayedSignals.length === 0 && pendingWatchlistTickers.length === 0 ? (
        <div className="text-center py-12 bg-[#121826] border border-radar-border rounded-xl p-6">
          <Flame className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">
            {activeView === "watchlist" ? "No signals yet for your watchlist stocks" : "No signals matching filter"}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
            {activeView === "watchlist"
              ? "Click 'Run Watchlist Only' to immediately pull forum posts and tweets for your stocks."
              : "Trigger a manual market scan or adjust your search filter."}
          </p>
          {activeView === "watchlist" && (
            <button
              onClick={() => triggerRun("watchlist_only")}
              className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold shadow-md hover:bg-amber-400 transition-colors"
            >
              ⚡ Run Watchlist Only Now
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Active Signals Cards */}
          {displayedSignals.map((s) => {
            const isExpanded = expandedTicker === s.id;
            const isBullish = s.sentiment_label === "Bullish";
            const isBearish = s.sentiment_label === "Bearish";
            const isWatchlist = watchlistSet.has(s.ticker.toUpperCase()) || s.risk_flags?.includes("Watchlist Priority");

            const delivPct = s.delivery_pct !== undefined && s.delivery_pct !== null ? Number(s.delivery_pct) : null;
            const isHighDelivery = delivPct !== null && delivPct >= 45.0;
            const isLowDelivery = delivPct !== null && delivPct < 28.0;

            const confluenceVerdict = s.confluence_verdict || (
              isHighDelivery && isBullish ? "Delivery-Confirmed Breakout"
              : isLowDelivery && s.mention_z_score >= 2.0 ? "Retail Distribution Trap"
              : s.signal_type
            );

            const isDeliveryBreakout = confluenceVerdict.includes("Breakout") || confluenceVerdict.includes("Confirmed");
            const isDistributionTrap = confluenceVerdict.includes("Trap") || confluenceVerdict.includes("Distribution");

            return (
              <div
                key={s.id}
                className={`bg-[#121826] border rounded-xl p-4 transition-all shadow-sm ${
                  isWatchlist
                    ? "border-amber-500/40 hover:border-amber-500/70"
                    : "border-radar-border hover:border-slate-700"
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-base font-bold text-white tracking-tight">{s.ticker}</h2>
                      {s.close_price && (
                        <span className="text-xs font-mono font-semibold text-slate-200">
                          ₹{s.close_price.toLocaleString("en-IN")}
                          {s.price_change_pct !== undefined && s.price_change_pct !== null && (
                            <span className={`ml-1 text-[11px] ${s.price_change_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              ({s.price_change_pct >= 0 ? "+" : ""}{s.price_change_pct}%)
                            </span>
                          )}
                        </span>
                      )}
                      {isWatchlist && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/80 text-amber-300">
                          ⭐ Watchlist
                        </span>
                      )}
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                        s.mention_z_score >= 2.5
                          ? "bg-rose-950/60 border-rose-800 text-rose-300"
                          : s.mention_z_score >= 1.5
                          ? "bg-amber-950/60 border-amber-800 text-amber-300"
                          : "bg-slate-800 border-slate-700 text-slate-300"
                      }`}>
                        +{s.mention_z_score}σ Spike
                      </span>

                      {/* Confluence Verdict Pill */}
                      {confluenceVerdict && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          isDeliveryBreakout
                            ? "bg-emerald-950/80 border-emerald-600/80 text-emerald-300"
                            : isDistributionTrap
                            ? "bg-rose-950/80 border-rose-600/80 text-rose-300"
                            : "bg-sky-950/80 border-sky-700/80 text-sky-300"
                        }`}>
                          {confluenceVerdict}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{s.company_name}</p>
                  </div>

                  {/* Sentiment Gauge Pill */}
                  <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs font-semibold ${
                    isBullish
                      ? "bg-emerald-950/50 border-emerald-800 text-emerald-400"
                      : isBearish
                      ? "bg-rose-950/50 border-rose-800 text-rose-400"
                      : "bg-slate-800/50 border-slate-700 text-slate-300"
                  }`}>
                    {isBullish ? <TrendingUp className="w-3.5 h-3.5" /> : isBearish ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    <span>{s.sentiment_score > 0 ? `+${s.sentiment_score}` : s.sentiment_score}</span>
                  </div>
                </div>

                {/* Official NSE Announcement Pill (if present) */}
                {s.latest_announcement && s.latest_announcement.desc && (
                  <div className="mt-2.5 bg-[#0B0F19] border border-blue-900/50 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px]">
                    <div className="flex items-center space-x-1.5 text-blue-300 truncate">
                      <Building2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      <span className="font-semibold text-blue-200 flex-shrink-0">Official Filing:</span>
                      <span className="text-slate-300 truncate">{s.latest_announcement.desc}</span>
                      {s.latest_announcement.date && (
                        <span className="text-slate-500 font-mono text-[10px] flex-shrink-0">
                          ({s.latest_announcement.date.slice(0, 11)})
                        </span>
                      )}
                    </div>
                    {s.latest_announcement.file_url && (
                      <a
                        href={s.latest_announcement.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-sky-400 hover:text-sky-300 text-[10px] ml-2 flex-shrink-0 font-medium"
                      >
                        <span>Official PDF</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                )}

                {/* AI Catalyst Brief */}
                <p className="text-xs text-slate-200 mt-2.5 leading-relaxed">
                  {s.catalyst_summary || "Automated retail discussion spike detected across trading forums."}
                </p>

                {/* Confluence Metrics Grid: Sentiment, Retail Gap & NSE Delivery % */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                  {/* Metric 1: Sentiment Meter */}
                  <div>
                    <span className="text-slate-400 block mb-1">Sentiment Meter</span>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full ${isBullish ? "bg-emerald-500" : isBearish ? "bg-rose-500" : "bg-slate-400"}`}
                        style={{ width: `${Math.min(100, Math.max(15, (s.sentiment_score + 1) * 50))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                      <span>Bearish (-1)</span>
                      <span>Bullish (+1)</span>
                    </div>
                  </div>

                  {/* Metric 2: Retail vs Deep-Dive Gap */}
                  <div>
                    <span className="text-slate-400 block mb-1">Retail vs Value Gap</span>
                    <div className="flex items-center space-x-1">
                      <span className={`font-mono font-medium ${Math.abs(s.retail_vs_analyst_divergence) > 0.4 ? 'text-amber-400' : 'text-slate-300'}`}>
                        {s.retail_vs_analyst_divergence > 0 ? `+${s.retail_vs_analyst_divergence}` : s.retail_vs_analyst_divergence}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate">
                        {s.retail_vs_analyst_divergence > 0.4
                          ? "(Retail FOMO)"
                          : s.retail_vs_analyst_divergence < -0.4
                          ? "(Contrarian Dip)"
                          : "(Aligned)"}
                      </span>
                    </div>
                  </div>

                  {/* Metric 3: Authoritative NSE Delivery % */}
                  <div>
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span>NSE Delivery Volume</span>
                      {delivPct !== null && (
                        <span className={`font-mono font-semibold text-[10px] ${
                          isHighDelivery ? "text-emerald-400" : isLowDelivery ? "text-rose-400" : "text-amber-300"
                        }`}>
                          {delivPct}%
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full ${
                          isHighDelivery ? "bg-emerald-500" : isLowDelivery ? "bg-rose-500" : "bg-amber-400"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, delivPct || 0))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                      <span>{isHighDelivery ? "Strong Hands" : isLowDelivery ? "Day-Traders" : "Normal Flow"}</span>
                      {s.delivery_qty && (
                        <span>{(s.delivery_qty / 100000).toFixed(1)}L deliv</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Risk & Confluence Flags */}
                {((s.risk_flags && s.risk_flags.length > 0) || (s.confluence_flags && s.confluence_flags.length > 0)) && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(s.confluence_flags || []).map((flag, idx) => (
                      <span
                        key={`c-${idx}`}
                        className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800/70 text-sky-300"
                      >
                        <PackageCheck className="w-2.5 h-2.5 text-sky-400" />
                        <span>{flag}</span>
                      </span>
                    ))}
                    {(s.risk_flags || []).map((flag, idx) => (
                      <span
                        key={`r-${idx}`}
                        className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300"
                      >
                        <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                        <span>{flag}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Accordion Expand for Sources, Quotations & Headlines */}
                <button
                  onClick={() => setExpandedTicker(isExpanded ? null : s.id)}
                  className="w-full flex items-center justify-between mt-3 pt-2 text-[11px] text-slate-400 hover:text-slate-200 border-t border-slate-800/40"
                >
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    <span>{s.mention_count} Mentions</span>
                    {s.sources_breakdown && (
                      <span className="text-slate-500">
                        ({Object.entries(s.sources_breakdown).map(([k, v]) => {
                          const srcName = k.replace('reddit_r_', 'r/').replace('x_twitter', 'X/Twitter').replace('moneycontrol', 'Moneycontrol');
                          return `${srcName}: ${v}`;
                        }).join(', ')})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 text-sky-400 hover:text-sky-300 font-medium">
                    <span>{isExpanded ? "Hide Discussions" : "View Exact Forum Quotes"}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-3 pt-2.5 border-t border-slate-800/80">
                    {/* Exact Forum Quotations Section */}
                    {s.exact_quotes && s.exact_quotes.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <Quote className="w-3 h-3 text-sky-400" />
                          <span>Verbatim Forum & Social Quotations</span>
                        </div>
                        <div className="space-y-2">
                          {s.exact_quotes.map((q, idx) => {
                            const srcLower = (q.source || "").toLowerCase();
                            const isReddit = srcLower.includes("reddit");
                            const isVP = srcLower.includes("valuepickr");
                            const isTQ = srcLower.includes("tradingqna");
                            const isMC = srcLower.includes("moneycontrol");
                            const isX = srcLower.includes("x") || srcLower.includes("twitter");
                            const isST = srcLower.includes("stocktwits");

                            const badgeStyle = isReddit
                              ? "bg-orange-950/70 border-orange-700/70 text-orange-300"
                              : isVP
                              ? "bg-blue-950/70 border-blue-700/70 text-blue-300"
                              : isTQ
                              ? "bg-purple-950/70 border-purple-700/70 text-purple-300"
                              : isMC
                              ? "bg-emerald-950/70 border-emerald-700/70 text-emerald-300"
                              : isX
                              ? "bg-slate-900 border-slate-600 text-slate-200"
                              : isST
                              ? "bg-amber-950/70 border-amber-700/70 text-amber-300"
                              : "bg-slate-800 border-slate-700 text-slate-300";

                            return (
                              <div
                                key={idx}
                                className="bg-[#0B0F19] p-3 rounded-lg border border-slate-800/90 text-xs space-y-2 hover:border-slate-700 transition-colors"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <div className="flex items-center space-x-2">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeStyle}`}>
                                      {q.source}
                                    </span>
                                    <span className="text-slate-400 font-mono text-[11px]">@{q.author}</span>
                                    {q.score !== undefined && q.score > 0 && (
                                      <span className="text-slate-500 text-[10px]">↑ {q.score}</span>
                                    )}
                                  </div>
                                  {q.url && (
                                    <a
                                      href={q.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center space-x-1 text-sky-400 hover:text-sky-300 text-[11px]"
                                    >
                                      <span>Original</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>

                                <blockquote className="text-slate-200 italic border-l-2 border-slate-700 pl-2.5 leading-relaxed text-xs">
                                  &ldquo;{q.quote}&rdquo;
                                </blockquote>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic py-1">
                        No verbatim quotes captured for this ticker in current window.
                      </div>
                    )}

                    {/* Recent Forum Headlines */}
                    {s.sample_headlines && s.sample_headlines.length > 0 && (
                      <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-slate-800 space-y-1.5 text-xs text-slate-300">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                          Recent Headlines
                        </span>
                        {s.sample_headlines.map((hl, i) => (
                          <div key={i} className="flex items-start space-x-1.5">
                            <span className="text-sky-500">•</span>
                            <span className="leading-snug">{hl}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pending Watchlist Stock Tiles (Shown in Watchlist View) */}
          {activeView === "watchlist" && pendingWatchlistTickers.length > 0 && (
            <div className="pt-2 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block px-1">
                Monitored Watchlist Stocks ({pendingWatchlistTickers.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {pendingWatchlistTickers.map((ticker) => (
                  <div
                    key={ticker}
                    className="bg-[#121826]/70 border border-dashed border-amber-500/30 rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-white text-sm">{ticker}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-600/50 text-amber-300 font-semibold">
                          ⭐ Watchlist
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Targeted monitoring ready
                      </span>
                    </div>

                    <button
                      onClick={() => triggerRun("watchlist_only", ticker)}
                      disabled={isPipelineRunning || triggeringMode === ticker}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center space-x-1 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>{triggeringMode === ticker ? "Queuing..." : `Scan ${ticker}`}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
