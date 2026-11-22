"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Activity, Radio, Cpu, Sliders, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Navbar() {
  const pathname = usePathname();
  const [triggering, setTriggering] = useState(false);
  const [triggerSuccess, setTriggerSuccess] = useState(false);
  const [marketStatus, setMarketStatus] = useState("NSE Closed");

  useEffect(() => {
    // Determine IST market status
    const updateMarketStatus = () => {
      const now = new Date();
      // UTC to IST (+5:30)
      const istTime = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60000);
      const hours = istTime.getHours();
      const minutes = istTime.getMinutes();
      const day = istTime.getDay(); // 0 is Sunday, 6 is Saturday

      if (day === 0 || day === 6) {
        setMarketStatus("Weekend Closed");
      } else if (hours === 9 && minutes < 15) {
        setMarketStatus("Pre-Market (9:00-9:15)");
      } else if ((hours === 9 && minutes >= 15) || (hours > 9 && hours < 15) || (hours === 15 && minutes <= 30)) {
        setMarketStatus("🟢 NSE Live (9:15-15:30)");
      } else if (hours === 15 && minutes > 30 && minutes <= 40) {
        setMarketStatus("Post-Market Closing");
      } else {
        setMarketStatus("NSE Closed");
      }
    };

    updateMarketStatus();
    const interval = setInterval(updateMarketStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleImmediateTrigger = async () => {
    if (!supabase || triggering) return;
    try {
      setTriggering(true);
      const { error } = await supabase
        .from("pipeline_config")
        .update({ trigger_immediate_run: true, updated_at: new Date().toISOString() })
        .eq("id", 1);

      if (!error) {
        setTriggerSuccess(true);
        setTimeout(() => setTriggerSuccess(false), 5000);
      }
    } catch (err) {
      console.error("Trigger error:", err);
    } finally {
      setTriggering(false);
    }
  };

  const navLinks = [
    { href: "/", label: "Radar", icon: Radio },
    { href: "/logs", label: "Telemetry", icon: Cpu },
    { href: "/settings", label: "Config", icon: Sliders },
  ];

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#0B0F19]/90 backdrop-blur-md border-b border-radar-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Activity className="w-5 h-5 animate-pulse text-sky-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-wide text-white">DalalPulse</span>
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                  RTX 4050
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">{marketStatus}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleImmediateTrigger}
              disabled={triggering}
              className={`flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                triggerSuccess
                  ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-300"
                  : "bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-300 active:scale-95"
              }`}
            >
              {triggering ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Signaling...</span>
                </>
              ) : triggerSuccess ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                  <span>Worker Queued!</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>Run Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Bottom Navigation for Mobile / Tablet */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F19]/95 backdrop-blur-lg border-t border-radar-border px-6 py-2.5 sm:hidden">
        <div className="flex justify-around items-center max-w-md mx-auto">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center space-y-1 transition-colors ${
                  active ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                <span className="text-[11px] font-medium tracking-tight">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
