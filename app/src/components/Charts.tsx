import { useId, useRef, useState } from "react";
import type { Series } from "../lib/data";

function pathFrom(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

// Build a "nice" axis scale (rounded min/max + step) for ~`count` ticks.
function niceScale(min: number, max: number, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  const rawStep = range / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step = niceNorm * mag;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { niceMin, niceMax, step, ticks };
}

function fmtTick(v: number, step: number): string {
  if (step < 1) return v.toFixed(1);
  return Math.round(v).toLocaleString();
}

function fmtMD(key?: string): string {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return `${m}/${d}`;
}

function fmtFull(key?: string): string {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function tooltipValue(metricLabel: string, label: string, unit: string, v: number): string {
  if (unit === "min" && metricLabel.toLowerCase() === "sleep") {
    const h = Math.floor(v / 60), m = Math.round(v % 60);
    return `${h}h ${m}m`;
  }
  if (unit === "lb") return `${v.toFixed(1)} lb`;
  return `${Math.round(v).toLocaleString()} ${unit}`;
}

function scale(values: (number | null)[], w: number, h: number, pad = 4) {
  const nums = values.filter((v): v is number => v != null);
  const min = nums.length ? Math.min(...nums) : 0;
  const max = nums.length ? Math.max(...nums) : 1;
  const span = max - min || 1;
  const n = values.length;
  return values
    .map((v, i) =>
      v == null
        ? null
        : {
            x: n > 1 ? (i / (n - 1)) * (w - pad * 2) + pad : w / 2,
            y: h - pad - ((v - min) / span) * (h - pad * 2),
          }
    );
}

export function Sparkline({ values, color = "var(--emerald)", w = 110, h = 34 }: {
  values: (number | null)[]; color?: string; w?: number; h?: number;
}) {
  const id = useId();
  const pts = scale(values, w, h).filter((p): p is { x: number; y: number } => p != null);
  if (pts.length < 2) return <svg width={w} height={h} />;
  const line = pathFrom(pts);
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${h} L${pts[0].x.toFixed(1)} ${h} Z`;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LineChart({ series, height = 240, unit, metricLabel = "", interactive = false }: {
  series: Series[]; height?: number; unit: string; metricLabel?: string; interactive?: boolean;
}) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Larger chart (Trends) uses a wider viewBox + bigger fonts.
  const big = height >= 280;
  const w = big ? 1100 : 700;
  const h = height;
  const padL = 50, padR = 16, padT = 14, padB = 34;
  const fsY = big ? 12 : 11, fsX = big ? 11 : 10, fsTitle = big ? 12 : 11;
  const lastR = big ? 6 : 5.5;

  const all = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v != null);
  const dataMin = all.length ? Math.min(...all) : 0;
  const dataMax = all.length ? Math.max(...all) : 1;
  const { niceMin, niceMax, step, ticks } = niceScale(dataMin, dataMax, 5);
  const lo = niceMin, hi = niceMax || 1;
  const n = series[0]?.points.length ?? 0;
  const baseY = h - padB;

  const X = (i: number) => (n > 1 ? padL + (i / (n - 1)) * (w - padL - padR) : (padL + w - padR) / 2);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (h - padT - padB);

  const dates = series[0]?.points.map((p) => p.date) ?? [];

  const onMove = (e: React.MouseEvent) => {
    if (!interactive || !svgRef.current || n < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * w;
    const idx = Math.round(((vbX - padL) / (w - padL - padR)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        style={{ display: "block", cursor: interactive ? "crosshair" : "default" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y gridlines + ticks */}
        {ticks.map((tv, i) => (
          <g key={`y${i}`}>
            <line x1={padL} x2={w - padR} y1={Y(tv)} y2={Y(tv)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padL - 10} y={Y(tv) + 3.5} fill="#5f717a" fontSize={fsY} textAnchor="end">{fmtTick(tv, step)}</text>
          </g>
        ))}
        {/* Y axis line + title */}
        <line x1={padL} x2={padL} y1={padT} y2={baseY} stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
        <text
          x={15} y={padT + (baseY - padT) / 2}
          fill="#93a4ad" fontSize={fsTitle} fontWeight={600} textAnchor="middle"
          transform={`rotate(-90 15 ${padT + (baseY - padT) / 2})`}
        >
          {metricLabel ? `${metricLabel} (${unit})` : unit}
        </text>

        {/* X axis line */}
        <line x1={padL} x2={w - padR} y1={baseY} y2={baseY} stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
        {/* X ticks every 2 days */}
        {dates.map((dk, i) =>
          i % 2 === 0 ? (
            <g key={`x${i}`}>
              <line x1={X(i)} x2={X(i)} y1={baseY} y2={baseY + 4} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              <text x={X(i)} y={baseY + 16} fill="#5f717a" fontSize={fsX} textAnchor="middle">{fmtMD(dk)}</text>
            </g>
          ) : null
        )}
        <text x={padL + (w - padL - padR) / 2} y={h - 3} fill="#93a4ad" fontSize={fsTitle} fontWeight={600} textAnchor="middle">
          Date (month / day)
        </text>

        {/* Series */}
        {series.map((s, si) => {
          const col = s.color.startsWith("var") ? cssVar(s.color) : s.color;
          const dashed = si > 0; // secondary series (calories out) is dashed
          const segs: { x: number; y: number }[][] = [];
          let cur: { x: number; y: number }[] = [];
          s.points.forEach((p, i) => {
            if (p.value == null) {
              if (cur.length) segs.push(cur);
              cur = [];
            } else cur.push({ x: X(i), y: Y(p.value) });
          });
          if (cur.length) segs.push(cur);
          const lastSeg = segs[segs.length - 1];
          const lastPt = lastSeg?.[lastSeg.length - 1];
          return (
            <g key={si}>
              <defs>
                <linearGradient id={`${id}-${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={col} stopOpacity="0.27" />
                  <stop offset="100%" stopColor={col} stopOpacity="0" />
                </linearGradient>
              </defs>
              {segs.map((seg, gi) => (
                <g key={gi}>
                  {si === 0 && seg.length > 1 && (
                    <path
                      d={`${pathFrom(seg)} L${seg[seg.length - 1].x.toFixed(1)} ${baseY} L${seg[0].x.toFixed(1)} ${baseY} Z`}
                      fill={`url(#${id}-${si})`}
                    />
                  )}
                  <path
                    d={pathFrom(seg)} fill="none" stroke={col}
                    strokeWidth={dashed ? 2 : 3} strokeLinecap="round"
                    strokeDasharray={dashed ? "5 5" : undefined}
                  />
                  {seg.length === 1 && <circle cx={seg[0].x} cy={seg[0].y} r="3" fill={col} />}
                </g>
              ))}
              {lastPt && (
                <circle cx={lastPt.x} cy={lastPt.y} r={lastR} fill={col} stroke="#0a0f14" strokeWidth="3" />
              )}
            </g>
          );
        })}

        {/* Hover guide + points + tooltip (Trends only) */}
        {interactive && hover != null && (() => {
          const hx = X(hover);
          const rows = series
            .map((s) => ({ s, v: s.points[hover]?.value }))
            .filter((r): r is { s: Series; v: number } => r.v != null);
          if (rows.length === 0) return null;
          const boxW = 150, lineH = 18, boxH = 24 + rows.length * lineH;
          let bx = hx + 12;
          if (bx + boxW > w - padR) bx = hx - 12 - boxW;
          const topY = Math.min(...rows.map((r) => Y(r.v)));
          let by = topY - boxH - 10;
          if (by < padT) by = topY + 14;
          return (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={padT} y2={baseY} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" strokeWidth="1" />
              {rows.map((r, ri) => {
                const col = r.s.color.startsWith("var") ? cssVar(r.s.color) : r.s.color;
                return <circle key={ri} cx={hx} cy={Y(r.v)} r={ri === 0 ? 6 : 5} fill={col} stroke="#0a0f14" strokeWidth="3" />;
              })}
              <rect x={bx} y={by} width={boxW} height={boxH} rx="10" fill="rgba(13,20,27,0.97)" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
              <text x={bx + 12} y={by + 18} fill="#eaf2f5" fontSize="12.5" fontWeight={700}>{fmtFull(dates[hover])}</text>
              {rows.map((r, ri) => {
                const col = r.s.color.startsWith("var") ? cssVar(r.s.color) : r.s.color;
                return (
                  <g key={ri} transform={`translate(${bx + 12}, ${by + 24 + (ri + 1) * lineH - 6})`}>
                    <circle cx="2" cy="-3" r="4" fill={col} />
                    <text x="12" y="0" fill="#93a4ad" fontSize="11.5">{r.s.label}</text>
                    <text x={boxW - 24} y="0" fill="#eaf2f5" fontSize="11.5" fontWeight={700} textAnchor="end">
                      {tooltipValue(metricLabel, r.s.label, unit, r.v)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 8 }}>
        {series.map((s) => {
          const col = s.color.startsWith("var") ? cssVar(s.color) : s.color;
          const dashed = series.length > 1 && s !== series[0];
          return (
            <span key={s.label} style={{ display: "inline-flex", alignItems: "center", fontSize: 12, color: "#93a4ad", fontWeight: 600 }}>
              <span style={{
                display: "inline-block", width: 18, height: dashed ? 0 : 3, borderRadius: 2,
                background: dashed ? "transparent" : col,
                borderTop: dashed ? `2px dashed ${col}` : undefined,
                marginRight: 7, verticalAlign: "middle",
              }} />
              {series.length > 1 ? s.label : `${metricLabel || s.label} (${unit})`}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function cssVar(v: string): string {
  const name = v.slice(4, -1);
  const map: Record<string, string> = {
    "--emerald": "#34d399", "--cyan": "#22d3ee", "--indigo": "#818cf8", "--teal": "#2dd4bf",
  };
  return map[name] ?? "#34d399";
}

// Compact ring for the mobile day-summary card: fill = progress toward the day's
// burn, with the net kcal shown in the center (deficit shown without a sign).
export function NetRing({ intake, burned, size = 84 }: { intake: number; burned: number; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const frac = burned > 0 ? Math.max(0, Math.min(1, intake / burned)) : 0;
  const net = Math.round(intake - burned);
  const netText = net > 0 ? `+${net}` : `${net}`;
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-border)" strokeWidth="7" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#netRingGrad)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(frac * c).toFixed(1)} ${c.toFixed(1)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <defs>
        <linearGradient id="netRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <text x="50%" y="48%" textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight={800}>{netText}</text>
      <text x="50%" y="64%" textAnchor="middle" fill="var(--faint)" fontSize="9" fontWeight={700} letterSpacing="0.06em">NET KCAL</text>
    </svg>
  );
}

export function Ring({ value, goal, size = 132 }: { value: number; goal: number; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, goal > 0 ? value / goal : 0));
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#ringGrad)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(frac * c).toFixed(1)} ${c.toFixed(1)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <text x="50%" y="46%" textAnchor="middle" fill="var(--text)" fontSize="22" fontWeight={800}>
        {Math.round(value).toLocaleString()}
      </text>
      <text x="50%" y="62%" textAnchor="middle" fill="var(--faint)" fontSize="11" fontWeight={700}>
        of {goal.toLocaleString()} kcal
      </text>
    </svg>
  );
}
