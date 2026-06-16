import { useState } from "react";
import { LineChart, Sparkline } from "../components/Charts";
import { MetricSwitcher } from "../components/Widgets";
import { useSummaries, useWeights, useMemoSeries, METRIC_LABEL } from "../lib/data";
import { fmtMinutes } from "../lib/dates";
import type { MetricKey } from "../lib/types";

const r1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default function Trends({ uid, rangeDays }: { uid: string; rangeDays: number }) {
  const [metric, setMetric] = useState<MetricKey>("weight");
  const summaries = useSummaries(uid, rangeDays);
  const weights = useWeights(uid);
  const { series, unit } = useMemoSeries(metric, summaries, weights, rangeDays);

  const withFood = summaries.filter((s) => s.mealsLogged > 0);
  const sleepDays = summaries.filter((s) => s.sleepDurationMin != null);
  const activeDays = summaries.filter((s) => s.activeMin != null);
  const wVals = weights.map((w) => w.weightLb);

  const stats: Record<MetricKey, { k: string; v: string }[]> = {
    weight: [
      { k: "AVG (LB)", v: wVals.length ? r1(avg(wVals)!).toFixed(1) : "—" },
      { k: "LOWEST", v: wVals.length ? Math.min(...wVals).toFixed(1) : "—" },
      {
        k: "NET CHANGE",
        v: wVals.length > 1 ? `${r1(wVals[0] - wVals[wVals.length - 1]) > 0 ? "+" : ""}${r1(wVals[0] - wVals[wVals.length - 1]).toFixed(1)}` : "—",
      },
    ],
    calories: [
      { k: "AVG IN", v: withFood.length ? String(Math.round(avg(withFood.map((s) => s.intakeKcal))!)) : "—" },
      { k: "AVG OUT", v: withFood.length ? String(Math.round(avg(withFood.map((s) => s.burnedKcal))!)) : "—" },
      { k: "DAILY DEFICIT", v: withFood.length ? String(Math.round(-avg(withFood.map((s) => s.netKcal))!)) : "—" },
    ],
    macros: [
      { k: "PROTEIN", v: withFood.length ? `${Math.round(avg(withFood.map((s) => s.proteinG))!)} g` : "—" },
      { k: "CARBS", v: withFood.length ? `${Math.round(avg(withFood.map((s) => s.carbsG))!)} g` : "—" },
      { k: "FAT", v: withFood.length ? `${Math.round(avg(withFood.map((s) => s.fatG))!)} g` : "—" },
    ],
    sleep: [
      { k: "AVG DURATION", v: sleepDays.length ? fmtMinutes(Math.round(avg(sleepDays.map((s) => s.sleepDurationMin!))!)) : "—" },
      { k: "BEST NIGHT", v: sleepDays.length ? fmtMinutes(Math.max(...sleepDays.map((s) => s.sleepDurationMin!))) : "—" },
      {
        k: "AVG SCORE",
        v: sleepDays.filter((s) => s.sleepScore != null).length
          ? String(Math.round(avg(sleepDays.filter((s) => s.sleepScore != null).map((s) => s.sleepScore!))!))
          : "—",
      },
    ],
    activity: [
      { k: "TOTAL MIN", v: activeDays.length ? String(activeDays.reduce((a, s) => a + (s.activeMin ?? 0), 0)) : "—" },
      { k: "SESSIONS", v: String(summaries.reduce((a, s) => a + s.workoutCount, 0)) },
      { k: "PER WEEK", v: summaries.length ? r1(summaries.reduce((a, s) => a + s.workoutCount, 0) / (summaries.length / 7)).toFixed(1) : "—" },
    ],
  };

  const smalls: { key: MetricKey; label: string; color: string; values: (number | null)[] }[] = [
    { key: "weight", label: "Weight", color: "#2dd4bf", values: weights.slice(0, 30).map((w) => w.weightLb).reverse() },
    { key: "calories", label: "Avg net balance", color: "#34d399", values: summaries.map((s) => (s.mealsLogged > 0 ? s.netKcal : null)) },
    { key: "macros", label: "Avg protein", color: "#34d399", values: summaries.map((s) => (s.mealsLogged > 0 ? s.proteinG : null)) },
    { key: "sleep", label: "Avg sleep", color: "#818cf8", values: summaries.map((s) => s.sleepDurationMin) },
    { key: "activity", label: "Active minutes", color: "#22d3ee", values: summaries.map((s) => s.activeMin) },
  ];

  return (
    <div className="grid12">
      <div className="card span12">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="label" style={{ flex: 1 }}>Last {rangeDays} days</div>
          <MetricSwitcher value={metric} onChange={setMetric} />
        </div>
        <LineChart series={series} unit={unit} height={280} metricLabel={METRIC_LABEL[metric]} interactive />
        <div style={{ display: "flex", gap: 26, marginTop: 14, flexWrap: "wrap" }}>
          {stats[metric].map((s) => (
            <div key={s.k}>
              <div className="label">{s.k}</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", marginTop: 2 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {smalls.map((m) => (
        <button
          key={m.key}
          className="card span4"
          onClick={() => setMetric(m.key)}
          style={{ textAlign: "left", color: "inherit", border: metric === m.key ? "1px solid rgba(52,211,153,0.45)" : undefined }}
        >
          <div className="label">{m.label}</div>
          <div style={{ marginTop: 10 }}>
            <Sparkline values={m.values} color={m.color} w={220} h={48} />
          </div>
        </button>
      ))}
    </div>
  );
}
