import { useMemo, useState } from "react";
import { LineChart } from "../components/Charts";
import { StatTile, Timeline, MacroBars, MetricSwitcher, QuickLogInput, EstimateCard } from "../components/Widgets";
import { useSummaries, useWeights, useDayBundle, useTodayFood, buildTimeline, useMemoSeries } from "../lib/data";
import { dateKey, fmtMinutes } from "../lib/dates";
import type { Estimate, MetricKey, UserDoc } from "../lib/types";

export default function Dashboard({ uid, user, rangeDays }: { uid: string; user: UserDoc; rangeDays: number }) {
  const today = dateKey();
  const summaries = useSummaries(uid, Math.max(rangeDays, 14));
  const weights = useWeights(uid);
  const bundle = useDayBundle(uid, today);
  const todayFood = useTodayFood(uid);
  const [metric, setMetric] = useState<MetricKey>("weight");
  const [latestEst, setLatestEst] = useState<Estimate | null>(null);

  const { series, unit } = useMemoSeries(metric, summaries, weights, rangeDays);
  const events = useMemo(() => buildTimeline(bundle), [bundle]);

  const last14 = summaries.slice(-14);
  const spark = (f: (s: (typeof summaries)[number]) => number | null) => last14.map(f);

  const todayTotals = todayFood.reduce(
    (a, f) => ({ kcal: a.kcal + f.kcal, proteinG: a.proteinG + f.proteinG, carbsG: a.carbsG + f.carbsG, fatG: a.fatG + f.fatG }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
  const todaySum = summaries.find((s) => s.date === today);
  const activeKcal = todaySum?.activeKcal ?? 0;
  const burned = user.bmrKcal + activeKcal;
  const net = todayTotals.kcal - burned;

  const latestWeight = weights[0];
  const prevWeight = weights[1];
  const wDelta = latestWeight && prevWeight ? latestWeight.weightLb - prevWeight.weightLb : null;

  return (
    <div className="grid12">
      <StatTile
        label="Net calories"
        value={net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
        unit="kcal"
        delta={net <= 0 ? "In a deficit today" : "Over burn so far"}
        deltaGood={net <= 0}
        spark={spark((s) => (s.mealsLogged > 0 ? s.netKcal : null))}
        color="#34d399"
      />
      <StatTile
        label="Weight"
        value={latestWeight ? latestWeight.weightLb.toFixed(1) : "—"}
        unit="lb"
        delta={wDelta != null ? `${wDelta > 0 ? "+" : ""}${wDelta.toFixed(1)} lb vs last weigh-in` : "Log your first weigh-in"}
        deltaGood={wDelta == null ? null : wDelta <= 0}
        spark={weights.slice(0, 14).map((w) => w.weightLb).reverse()}
        color="#2dd4bf"
      />
      <StatTile
        label="Sleep"
        value={bundle.sleep ? fmtMinutes(bundle.sleep.durationMin) : "—"}
        delta={bundle.sleep?.score != null ? `Score ${bundle.sleep.score}` : "Awaiting Oura sync"}
        deltaGood={bundle.sleep?.score != null ? bundle.sleep.score >= 75 : null}
        spark={spark((s) => s.sleepDurationMin)}
        color="#818cf8"
      />
      <StatTile
        label="Active"
        value={todaySum?.activeMin != null ? String(todaySum.activeMin) : "—"}
        unit="min"
        delta={activeKcal ? `${activeKcal} kcal burned today` : "No activity synced yet"}
        deltaGood={null}
        spark={spark((s) => s.activeMin)}
        color="#22d3ee"
      />

      <div className="card span8">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="label" style={{ flex: 1 }}>Trend</div>
          <MetricSwitcher value={metric} onChange={setMetric} />
        </div>
        <LineChart series={series} unit={unit} />
      </div>

      <div className="card span4 row2">
        <div className="label">Today's timeline</div>
        <Timeline events={events} empty="Nothing yet today — log a meal or wait for the next Oura sync." />
      </div>

      <div className="card span4">
        <div className="label">Macros today</div>
        <MacroBars totals={todayTotals} goals={user.dailyGoals} />
      </div>

      <div className="card span4">
        <div className="label" style={{ marginBottom: 10 }}>AI quick log</div>
        <QuickLogInput busy={false} onEstimate={(_t, est) => setLatestEst(est)} />
        <div className="chips" style={{ marginTop: 10 }}>
          {["Greek yogurt, berries & granola", "Chicken burrito bowl", "Apple & almonds"].map((s) => (
            <button key={s} className="chip" onClick={() => { /* suggestion chips just prefill mentally; keep tap-to-copy simple */ navigator.clipboard?.writeText(s); }}>
              {s}
            </button>
          ))}
        </div>
        {latestEst && (
          <div style={{ marginTop: 12 }}>
            <EstimateCard est={latestEst} uid={uid} />
          </div>
        )}
      </div>
    </div>
  );
}
