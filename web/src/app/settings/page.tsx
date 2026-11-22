"use client";

import { useEffect, useState } from "react";
import { Sliders, Save, Check, Bell, Shield, Database, Plus, Trash2, Crosshair, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PipelineConfig } from "@/types";

const POPULAR_SUGGESTIONS = [
  "RELIANCE", "TATAMOTORS", "HDFCBANK", "INFY", "ZOMATO",
  "SUZLON", "IRFC", "BSE", "CDSL", "HAL", "ITC", "VEDL"
];

export default function SettingsPage() {
  const [config, setConfig] = useState<PipelineConfig>({
    id: 1,
    trigger_immediate_run: false,
    min_mention_threshold: 5,
    z_score_threshold: 2.0,
    subreddits: ["IndianStreetBets", "IndiaInvestments", "DalalStreetTalks"],
    valuepickr_enabled: true,
    tradingqna_enabled: true,
    stocktwits_enabled: true,
    moneycontrol_enabled: true,
    x_twitter_enabled: true,
    telegram_notifications: false,
    max_synthesize_tickers: 10,
    watchlist_tickers: ["RELIANCE", "TATAMOTORS", "HDFCBANK", "INFY", "ZOMATO", "SUZLON", "IRFC"],
    radar_mode: "all_radar",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [newSubreddit, setNewSubreddit] = useState("");
  const [newTicker, setNewTicker] = useState("");

  useEffect(() => {
    const fetchConfig = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("pipeline_config")
          .select("*")
          .eq("id", 1)
          .single();

        if (!error && data) {
          setConfig({
            ...data,
            watchlist_tickers: data.watchlist_tickers || ["RELIANCE", "TATAMOTORS", "HDFCBANK", "INFY", "ZOMATO", "SUZLON", "IRFC"],
            radar_mode: data.radar_mode || "all_radar",
          } as PipelineConfig);
        }
      } catch (err) {
        console.error("Error loading config:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!supabase || saving) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from("pipeline_config")
        .update({
          min_mention_threshold: config.min_mention_threshold,
          z_score_threshold: config.z_score_threshold,
          subreddits: config.subreddits,
          valuepickr_enabled: config.valuepickr_enabled,
          tradingqna_enabled: config.tradingqna_enabled,
          stocktwits_enabled: config.stocktwits_enabled,
          moneycontrol_enabled: config.moneycontrol_enabled ?? true,
          x_twitter_enabled: config.x_twitter_enabled ?? true,
          telegram_notifications: config.telegram_notifications,
          max_synthesize_tickers: config.max_synthesize_tickers,
          watchlist_tickers: config.watchlist_tickers,
          radar_mode: config.radar_mode,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (!error) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 4000);
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const addTicker = (tickerToAdd?: string) => {
    const sym = (tickerToAdd || newTicker).trim().toUpperCase().replace(/[$#]/g, "");
    if (sym && !config.watchlist_tickers.includes(sym)) {
      setConfig({
        ...config,
        watchlist_tickers: [...config.watchlist_tickers, sym]
      });
      if (!tickerToAdd) setNewTicker("");
    }
  };

  const removeTicker = (sym: string) => {
    setConfig({
      ...config,
      watchlist_tickers: config.watchlist_tickers.filter((t) => t !== sym),
    });
  };

  const addSubreddit = () => {
    const clean = newSubreddit.trim().replace(/^r\//, "");
    if (clean && !config.subreddits.includes(clean)) {
      setConfig({ ...config, subreddits: [...config.subreddits, clean] });
      setNewSubreddit("");
    }
  };

  const removeSubreddit = (sub: string) => {
    setConfig({
      ...config,
      subreddits: config.subreddits.filter((s) => s !== sub),
    });
  };

  if (loading) {
    return (
      <div className="h-64 bg-[#121826] border border-radar-border rounded-xl animate-pulse" />
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Pipeline & Stocks Configuration</h1>
          <p className="text-xs text-slate-400">Settings sync automatically with your local workhorse</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs px-3.5 py-2 rounded-lg transition-all active:scale-95 shadow-sm"
        >
          {saving ? (
            <span>Saving...</span>
          ) : savedSuccess ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>

      {/* Target Watchlist Card */}
      <div className="bg-[#121826] border border-radar-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Crosshair className="w-4 h-4 text-sky-400" />
            <span>Target Stock Watchlist ({config.watchlist_tickers.length})</span>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-[#0B0F19] p-0.5 rounded-lg border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => setConfig({ ...config, radar_mode: "all_radar" })}
              className={`px-2.5 py-1 rounded-md transition-all ${
                config.radar_mode === "all_radar"
                  ? "bg-sky-500 text-slate-950 font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All NSE Stocks
            </button>
            <button
              type="button"
              onClick={() => setConfig({ ...config, radar_mode: "watchlist_only" })}
              className={`px-2.5 py-1 rounded-md transition-all ${
                config.radar_mode === "watchlist_only"
                  ? "bg-sky-500 text-slate-950 font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Watchlist Only
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          {config.radar_mode === "all_radar"
            ? "🌐 Radar Mode: Scans all 2,632 NSE listed equities, but gives priority scoring to your watchlist stocks."
            : "🎯 Watchlist Only Mode: Strictly evaluates and alerts only on your custom list below."}
        </p>

        {/* Watchlist Chips */}
        <div className="flex flex-wrap gap-1.5 min-h-[40px] p-2 bg-[#0B0F19] rounded-lg border border-slate-800">
          {config.watchlist_tickers.length === 0 ? (
            <span className="text-xs text-slate-500 italic p-1">No stocks in watchlist. Add tickers below.</span>
          ) : (
            config.watchlist_tickers.map((sym) => (
              <span
                key={sym}
                className="inline-flex items-center space-x-1.5 text-xs font-mono font-medium bg-sky-950/60 border border-sky-800/80 px-2.5 py-1 rounded-md text-sky-300"
              >
                <span>{sym}</span>
                <button
                  type="button"
                  onClick={() => removeTicker(sym)}
                  className="text-slate-400 hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>

        {/* Add Ticker Input */}
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Add NSE Symbol (e.g. RELIANCE, ZOMATO, TATASTEEL)"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTicker()}
            className="bg-[#0B0F19] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 flex-1 uppercase font-mono"
          />
          <button
            type="button"
            onClick={() => addTicker()}
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center space-x-1 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Stock</span>
          </button>
        </div>

        {/* Quick Add Suggestions */}
        <div>
          <span className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">
            Quick Add Popular Equities
          </span>
          <div className="flex flex-wrap gap-1">
            {POPULAR_SUGGESTIONS.filter((s) => !config.watchlist_tickers.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addTicker(s)}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
              >
                +{s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Thresholds Card */}
      <div className="bg-[#121826] border border-radar-border rounded-xl p-4 space-y-4">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <Shield className="w-4 h-4 text-sky-400" />
          <span>Anomaly & Sensitivity Thresholds</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-300 font-medium block mb-1">
              Minimum Mentions ({config.min_mention_threshold})
            </label>
            <input
              type="range"
              min="2"
              max="20"
              value={config.min_mention_threshold}
              onChange={(e) => setConfig({ ...config, min_mention_threshold: parseInt(e.target.value) })}
              className="w-full accent-sky-400"
            />
            <span className="text-[10px] text-slate-500">Mentions needed to trigger general alert</span>
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1">
              Mention Z-Score Threshold ({config.z_score_threshold}σ)
            </label>
            <input
              type="range"
              min="1.0"
              max="3.5"
              step="0.1"
              value={config.z_score_threshold}
              onChange={(e) => setConfig({ ...config, z_score_threshold: parseFloat(e.target.value) })}
              className="w-full accent-sky-400"
            />
            <span className="text-[10px] text-slate-500">Statistical standard deviations over 14-day average</span>
          </div>
        </div>
      </div>

      {/* Ingestion Sources Card */}
      <div className="bg-[#121826] border border-radar-border rounded-xl p-4 space-y-4">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <Database className="w-4 h-4 text-sky-400" />
          <span>Active Ingestion Feeds</span>
        </div>

        {/* Subreddits list */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Monitored Subreddits</label>
          <div className="flex flex-wrap gap-2 mb-2.5">
            {config.subreddits.map((sub) => (
              <span
                key={sub}
                className="inline-flex items-center space-x-1.5 text-xs bg-[#0B0F19] border border-slate-700 px-2.5 py-1 rounded-lg text-slate-200"
              >
                <span>r/{sub}</span>
                <button
                  type="button"
                  onClick={() => removeSubreddit(sub)}
                  className="text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="e.g. IndianStreetBets"
              value={newSubreddit}
              onChange={(e) => setNewSubreddit(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSubreddit()}
              className="bg-[#0B0F19] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 flex-1"
            />
            <button
              type="button"
              onClick={addSubreddit}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Toggles */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-200 font-medium block">ValuePickr Forum</span>
              <span className="text-[10px] text-slate-400">Fundamental & high-conviction deep-dive threads</span>
            </div>
            <input
              type="checkbox"
              checked={config.valuepickr_enabled}
              onChange={(e) => setConfig({ ...config, valuepickr_enabled: e.target.checked })}
              className="w-4 h-4 accent-sky-400 rounded"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-200 font-medium block">TradingQnA (Zerodha)</span>
              <span className="text-[10px] text-slate-400">Discourse trading discussions & queries</span>
            </div>
            <input
              type="checkbox"
              checked={config.tradingqna_enabled}
              onChange={(e) => setConfig({ ...config, tradingqna_enabled: e.target.checked })}
              className="w-4 h-4 accent-sky-400 rounded"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-200 font-medium block">Stocktwits Stream</span>
              <span className="text-[10px] text-slate-400">Realtime retail trader message streams</span>
            </div>
            <input
              type="checkbox"
              checked={config.stocktwits_enabled}
              onChange={(e) => setConfig({ ...config, stocktwits_enabled: e.target.checked })}
              className="w-4 h-4 accent-sky-400 rounded"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-200 font-medium block">Moneycontrol Buzz & Discussions</span>
              <span className="text-[10px] text-slate-400">Buzzing stocks, retail targets & market commentary</span>
            </div>
            <input
              type="checkbox"
              checked={config.moneycontrol_enabled ?? true}
              onChange={(e) => setConfig({ ...config, moneycontrol_enabled: e.target.checked })}
              className="w-4 h-4 accent-sky-400 rounded"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-200 font-medium block">X (Twitter) Indian Equities</span>
              <span className="text-[10px] text-slate-400">Breaking market tweets, viral retail sentiment & cashtags</span>
            </div>
            <input
              type="checkbox"
              checked={config.x_twitter_enabled ?? true}
              onChange={(e) => setConfig({ ...config, x_twitter_enabled: e.target.checked })}
              className="w-4 h-4 accent-sky-400 rounded"
            />
          </div>
        </div>
      </div>

      {/* Notifications Card */}
      <div className="bg-[#121826] border border-radar-border rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <Bell className="w-4 h-4 text-sky-400" />
          <span>Alerts & Notifications</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-200 font-medium block">Telegram Radar Briefs</span>
            <span className="text-[10px] text-slate-400">Receive morning & evening market briefs to your phone</span>
          </div>
          <input
            type="checkbox"
            checked={config.telegram_notifications}
            onChange={(e) => setConfig({ ...config, telegram_notifications: e.target.checked })}
            className="w-4 h-4 accent-sky-400 rounded"
          />
        </div>
      </div>
    </div>
  );
}
