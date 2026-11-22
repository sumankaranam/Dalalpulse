"use client";

import { useEffect, useState } from "react";
import { Cpu, CheckCircle2, XCircle, Clock, RefreshCw, Terminal, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { RunLog } from "@/types";

export default function LogsPage() {
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("run_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setLogs(data as RunLog[]);
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Execution Telemetry</h1>
          <p className="text-xs text-slate-400">Hardware & pipeline run history on AMD Ryzen 7 + RTX 4050</p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 bg-[#121826] border border-radar-border px-2.5 py-1.5 rounded-lg"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 bg-[#121826]/60 border border-radar-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 bg-[#121826] border border-radar-border rounded-xl p-6">
          <Terminal className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No execution logs found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Logs will populate when the local worker runs scheduled or on-demand pipelines.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const isSuccess = log.status === "success";
            const isRunning = log.status === "running";
            const isExpanded = expandedLogId === log.id;

            return (
              <div
                key={log.id}
                className="bg-[#121826] border border-radar-border rounded-xl p-4 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    {isSuccess ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : isRunning ? (
                      <RefreshCw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          {log.trigger_source}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                          isSuccess
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : isRunning
                            ? "bg-sky-950 text-sky-300 border border-sky-800"
                            : "bg-rose-950 text-rose-300 border border-rose-800"
                        }`}>
                          {log.status}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(log.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-semibold text-slate-300">
                      {log.duration_seconds ? `${log.duration_seconds.toFixed(1)}s` : "In Progress"}
                    </span>
                  </div>
                </div>

                {/* Telemetry Stats Grid */}
                <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-center">
                  <div className="bg-[#0B0F19] p-2 rounded-lg border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block">Scraped</span>
                    <span className="text-xs font-bold text-slate-200">{log.posts_scraped || 0}</span>
                  </div>
                  <div className="bg-[#0B0F19] p-2 rounded-lg border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block">Tickers</span>
                    <span className="text-xs font-bold text-slate-200">{log.tickers_detected || 0}</span>
                  </div>
                  <div className="bg-[#0B0F19] p-2 rounded-lg border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block">Signals</span>
                    <span className="text-xs font-bold text-sky-400">{log.signals_generated || 0}</span>
                  </div>
                  <div className="bg-[#0B0F19] p-2 rounded-lg border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block">Peak VRAM</span>
                    <span className="text-xs font-bold text-emerald-400">
                      {log.gpu_vram_peak_mb ? `${log.gpu_vram_peak_mb.toFixed(0)} MB` : "—"}
                    </span>
                  </div>
                </div>

                {/* Log Details Toggle */}
                {log.logs && (
                  <div className="mt-3">
                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center space-x-1"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>{isExpanded ? "Hide terminal output" : "Show terminal output"}</span>
                    </button>
                    {isExpanded && (
                      <pre className="mt-2 p-3 bg-[#0B0F19] rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-56 leading-relaxed">
                        {log.logs}
                      </pre>
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
