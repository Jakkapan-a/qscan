import type { Grade, Status } from "@/lib/scan/types";
import { cn } from "@/lib/utils";

/** Colour scheme: emerald = secure, amber = weak, rose = missing/vulnerable, indigo = info. */
const STATUS_STYLES: Record<Status, string> = {
  SECURE: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  WEAK: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  MISSING: "bg-rose-500/10 text-rose-400 ring-rose-500/30",
  VULNERABLE: "bg-rose-500/15 text-rose-300 ring-rose-500/40",
  INFO: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/30",
  UNKNOWN: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30",
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider ring-1 ring-inset",
        STATUS_STYLES[status],
      )}
    >
      {label ?? status}
    </span>
  );
}

const GRADE_STYLES: Record<Grade, { ring: string; text: string; glow: string; label: string }> = {
  "A+": { ring: "ring-emerald-400/60", text: "text-emerald-300", glow: "shadow-emerald-500/30", label: "Excellent" },
  A: { ring: "ring-emerald-500/50", text: "text-emerald-400", glow: "shadow-emerald-500/20", label: "Strong" },
  B: { ring: "ring-amber-500/50", text: "text-amber-400", glow: "shadow-amber-500/20", label: "Needs work" },
  C: { ring: "ring-orange-500/50", text: "text-orange-400", glow: "shadow-orange-500/20", label: "Weak" },
  F: { ring: "ring-rose-500/60", text: "text-rose-400", glow: "shadow-rose-500/30", label: "Failing" },
};

export function GradeBadge({ grade, score }: { grade: Grade; score: number }) {
  const s = GRADE_STYLES[grade];
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn("grid size-24 place-items-center rounded-2xl bg-zinc-950 shadow-2xl ring-2", s.ring, s.glow)}
        aria-label={`Security grade ${grade}`}
      >
        <span className={cn("font-mono text-5xl font-bold", s.text)}>{grade}</span>
      </div>
      <div>
        <p className={cn("text-sm font-semibold tracking-widest uppercase", s.text)}>{s.label}</p>
        <p className="font-mono text-3xl font-bold text-zinc-100">
          {score}
          <span className="text-base text-zinc-500">/100</span>
        </p>
      </div>
    </div>
  );
}
