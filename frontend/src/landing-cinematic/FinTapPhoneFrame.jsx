import { useId } from "react";

/**
 * Faux écran appli (placeholder type Framer) — pas d’actif binaire requis.
 */
export function FinTapPhoneFrame({ variant = "default", className = "" }) {
  const g = useId();
  if (variant === "chart" || variant === "default") {
    return (
      <div
        className={`fintap-phone fintap-phone--chart ${className}`.trim()}
        aria-hidden="true"
      >
        <div className="fintap-phone-notch" />
        <div className="fintap-screen fintap-screen--chart p-4">
          <div className="mb-4 h-2 w-24 rounded-full bg-black/10" />
          <div className="h-32 rounded-2xl bg-gradient-to-br from-sky-100/90 to-sky-50 p-3 shadow-inner">
            <svg className="h-full w-full" viewBox="0 0 120 80" fill="none" aria-hidden>
              <path
                d="M0 60 L20 50 L40 45 L60 20 L80 30 L100 8 L120 0 V80 H0 Z"
                fill={`url(#${g}g)`}
                opacity="0.85"
              />
              <line x1="0" y1="60" x2="120" y2="60" stroke="rgba(0,0,0,0.08)" />
              <defs>
                <linearGradient id={`${g}g`} x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="rgba(10, 152, 255, 0.35)" />
                  <stop offset="1" stopColor="rgba(10, 152, 255, 0.02)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="h-12 rounded-xl bg-white/80 shadow-sm" />
            <div className="h-12 rounded-xl bg-white/80 shadow-sm" />
          </div>
        </div>
      </div>
    );
  }
  if (variant === "cards") {
    return (
      <div className={`fintap-phone fintap-phone--cards ${className}`.trim()} aria-hidden="true">
        <div className="fintap-phone-notch" />
        <div className="fintap-screen p-4">
          <div className="mb-3 h-2 w-32 rounded-full bg-black/8" />
          <div className="space-y-2">
            <div className="h-20 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-600 shadow-md" />
            <div className="h-20 rounded-2xl bg-gradient-to-r from-violet-500/30 to-fuchsia-400/30" />
            <div className="h-10 rounded-full bg-white shadow" />
          </div>
        </div>
      </div>
    );
  }
  if (variant === "ai") {
    return (
      <div className={`fintap-phone fintap-phone--ai ${className}`.trim()} aria-hidden="true">
        <div className="fintap-phone-notch" />
        <div className="fintap-screen p-4 text-left">
          <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
            AI
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-white/90 px-3 py-2 shadow-sm">
                <div className="h-2 w-20 rounded bg-black/10" />
                <div className="h-2 w-8 rounded bg-sky-400/40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (variant === "subs") {
    return (
      <div className={`fintap-phone fintap-phone--subs ${className}`.trim()} aria-hidden="true">
        <div className="fintap-phone-notch" />
        <div className="fintap-screen p-4 text-left">
          <div className="mb-3 h-2 w-28 rounded-full bg-black/8" />
          <div className="space-y-3">
            {["Spotify", "Netflix", "iCloud", "Gym"].map((label) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-2xl border border-black/6 bg-white px-3 py-3 shadow-sm"
              >
                <span className="text-sm font-medium text-black/80">{label}</span>
                <div className="h-5 w-10 rounded-full bg-emerald-400/40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return null;
}
