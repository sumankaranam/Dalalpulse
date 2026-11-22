"use client";

import { useEffect, useState } from "react";
import { 
  TrendingUp, TrendingDown, Minus, Flame, AlertTriangle, 
  MessageSquare, Users, ExternalLink, RefreshCw, ChevronDown, ChevronUp, Quote 
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DailySignal } from "@/types";

export default function RadarPage() {
  const [signals, setSignals] = useState<DailySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "watchlist" | "hype" | "bullish" | "bearish" | "divergent">("all");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const fetchSignals = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("daily_signals")
        .select("*")
        .order("mention_z_score", { ascending: false })
        .limit(30);

      if (!error && data) {
        setSignals(data as DailySignal[]);
      }
    } catch (err) {
      console.error("Error fetching signals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const filteredSignals = signals.filter((s) => {
    if (filter === "watchlist") return s.risk_flags?.includes("Watchlist Priority");
    if (filter === "hype") return s.mention_z_score >= 2.0;
    if (filter === "bullish") return s.sentiment_score > 0.15;
    if (filter === "bearish") return s.sentiment_score < -0.15;
    if (filter === "divergent") return Math.abs(s.retail_vs_analyst_divergence) > 0.4;
    return true;
  });

  const topZ = signals.length > 0 ? signals[0] : null;
  const avgSentiment = signals.length > 0
    ? (signals.reduce((acc, s) => acc + s.sentiment_score, 0) / signals.length).toFixed(2)
    : "0.00";

  return (
    <div className="space-y-5">
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
          <span className="text-[11px] text-slate-500 block mt-0.5">Across flagged equities</span>
        </div>

        <div className="bg-[#121826] border border-radar-border p-3.5 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Flagged Stocks</span>
          <div className="text-lg font-bold text-white mt-1">{signals.length}</div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Exceeding threshold</span>
        </div>

        <div className="bg-[#121826] border border-radar-border p-3.5 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Control Plane</span>
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-400 mt-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>Local GPU Synced</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">AMD 7840HS + RTX 4050</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { key: "all", label: "All Tickers" },
          { key: "watchlist", label: "⭐ Watchlist" },
          { key: "hype", label: "🔥 Hype Spikes (≥2σ)" },
          { key: "bullish", label: "🟢 Bullish" },
          { key: "bearish", label: "🔴 Bearish" },
          { key: "divergent", label: "⚡ Persona Divergence" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filter === tab.key
                ? "bg-sky-500 text-slate-950 font-semibold shadow-sm"
                : "bg-[#121826] text-slate-400 hover:text-slate-200 border border-radar-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Signals List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 bg-[#121826]/60 border border-radar-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="text-center py-12 bg-[#121826] border border-radar-border rounded-xl p-6">
          <Flame className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No signals matching filter</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Trigger a manual run using the top button or wait for the scheduled 8:15 AM / 4:15 PM IST runs.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredSignals.map((s) => {
            const isExpanded = expandedTicker === s.id;
            const isBullish = s.sentiment_label === "Bullish";
            const isBearish = s.sentiment_label === "Bearish";

            return (
              <div
                key={s.id}
                className="bg-[#121826] border border-radar-border rounded-xl p-4 transition-all hover:border-slate-700 shadow-sm"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-base font-bold text-white tracking-tight">{s.ticker}</h2>
                      {s.risk_flags?.includes("Watchlist Priority") && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-950/80 border border-sky-500/80 text-sky-300">
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
                      {s.signal_type !== "Normal" && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                          {s.signal_type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.company_name}</p>
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

                {/* AI Catalyst Brief */}
                <p className="text-xs text-slate-200 mt-3 leading-relaxed">
                  {s.catalyst_summary || "Automated retail discussion spike detected across trading forums."}
                </p>

                {/* Sentiment & Divergence Visual Meter */}
                <div className="mt-3.5 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-[11px]">
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

                  <div>
                    <span className="text-slate-400 block mb-1">Retail vs Deep-Dive Gap</span>
                    <div className="flex items-center space-x-1">
                      <span className={`font-mono font-medium ${Math.abs(s.retail_vs_analyst_divergence) > 0.4 ? 'text-amber-400' : 'text-slate-300'}`}>
                        {s.retail_vs_analyst_divergence > 0 ? `+${s.retail_vs_analyst_divergence}` : s.retail_vs_analyst_divergence}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {s.retail_vs_analyst_divergence > 0.4
                          ? "(Retail FOMO Trap)"
                          : s.retail_vs_analyst_divergence < -0.4
                          ? "(Contrarian Dip)"
                          : "(Aligned)"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Risk Flags */}
                {s.risk_flags && s.risk_flags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {s.risk_flags.map((flag, idx) => (
                      <span
                        key={idx}
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
        </div>
      )}
    </div>
  );
}
