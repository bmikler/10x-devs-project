interface Props {
  spentCents: number;
  limitCents: number;
}

/**
 * Horizontal budget bar — fill = spent/limit, colour-coded by burn level.
 * Pure presentational (no hooks/state) so it renders identically whether
 * imported into the React monthly island or rendered statically inside an
 * `.astro` page. Fill is clamped at 100%; an explicit overflow cap signals
 * over-budget. (For a JVM dev: a stateless render function, no lifecycle.)
 */
export default function ProgressBar({ spentCents, limitCents }: Props) {
  const pct = limitCents > 0 ? (spentCents / limitCents) * 100 : 0;
  const fillPct = Math.min(100, Math.max(0, pct));
  const over = pct > 100;
  // Traffic-light fill: green under 80%, amber 80–100%, red over budget.
  const fillColor = over ? "bg-red-400" : pct >= 80 ? "bg-amber-300" : "bg-emerald-400";

  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-valuenow={Math.round(fillPct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${fillColor}`} style={{ width: `${fillPct}%` }} />
      {over && <div className="absolute inset-y-0 right-0 w-1.5 bg-red-100/70" />}
    </div>
  );
}
