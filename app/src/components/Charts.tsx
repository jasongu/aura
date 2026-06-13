import { useId } from "react";
import type { Series } from "../lib/data";

function pathFrom(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
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

export function LineChart({ series, height = 240, unit }: {
  series: Series[]; height?: number; unit: string;
}) {
  const id = useId();
  const w = 720, h = height, padL = 8, padR = 8, padT = 14, padB = 22;

  const all = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v != null);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const span = max - min || 1;
  const lo = min - span * 0.08, hi = max + span * 0.08;
  const n = series[0]?.points.length ?? 0;

  const X = (i: number) => (n > 1 ? padL + (i / (n - 1)) * (w - padL - padR) : w / 2);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);

  const gridYs = [0.25, 0.5, 0.75].map((t) => padT + t * (h - padT - padB));
  const firstLabel = series[0]?.points[0]?.date;
  const lastLabel = series[0]?.points[n - 1]?.date;
  const fmt = (k?: string) => {
    if (!k) return "";
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: "block" }}>
        {gridYs.map((gy, i) => (
          <line key={i} x1={padL} x2={w - padR} y1={gy} y2={gy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {series.map((s, si) => {
          const segs: { x: number; y: number }[][] = [];
          let cur: { x: number; y: number }[] = [];
          s.points.forEach((p, i) => {
            if (p.value == null) {
              if (cur.length) segs.push(cur);
              cur = [];
            } else cur.push({ x: X(i), y: Y(p.value) });
          });
          if (cur.length) segs.push(cur);
          return (
            <g key={si}>
              <defs>
                <linearGradient id={`${id}-${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color.startsWith("var") ? cssVar(s.color) : s.color} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={s.color.startsWith("var") ? cssVar(s.color) : s.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              {segs.map((seg, gi) => (
                <g key={gi}>
                  {si === 0 && seg.length > 1 && (
                    <path
                      d={`${pathFrom(seg)} L${seg[seg.length - 1].x.toFixed(1)} ${h - padB} L${seg[0].x.toFixed(1)} ${h - padB} Z`}
                      fill={`url(#${id}-${si})`}
                    />
                  )}
                  <path d={pathFrom(seg)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" />
                  {seg.length === 1 && <circle cx={seg[0].x} cy={seg[0].y} r="3" fill={s.color} />}
                </g>
              ))}
            </g>
          );
        })}
        <text x={padL} y={h - 6} fill="var(--faint)" fontSize="11" fontWeight={700}>{fmt(firstLabel)}</text>
        <text x={w - padR} y={h - 6} fill="var(--faint)" fontSize="11" fontWeight={700} textAnchor="end">{fmt(lastLabel)}</text>
      </svg>
      {series.length > 1 && (
        <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
          {series.map((s) => (
            <span key={s.label} style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
              <span style={{
                display: "inline-block", width: 10, height: 3, borderRadius: 2,
                background: s.color, marginRight: 6, verticalAlign: "middle",
              }} />
              {s.label} ({unit})
            </span>
          ))}
        </div>
      )}
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
