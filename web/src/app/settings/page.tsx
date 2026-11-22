"use client";

import { useEffect, useState } from "react";
import { Sliders, Save, Check, Bell, Shield, Database, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PipelineConfig } from "@/types";

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
    telegram_notifications: false,
    max_synthesize_tickers: 10,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [newSubreddit, setNewSubreddit] = useState("");

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
          setConfig(data as PipelineConfig);
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
          telegram_notifications: config.telegram_notifications,
          max_synthesize_tickers: config.max_synthesize_tickers,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Remote Pipeline Controls</h1>
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
            <span className="text-[10px] text-slate-500">Minimum daily occurrences before flagging</span>
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
