import { useState } from "react";
import { Sparkline } from "./Charts";
import { IconMoon, IconScale, IconRun, IconBowl, IconFlame, IconSend, IconCheck } from "./Icons";
import type { TimelineEvent, Estimate, MetricKey, UserDoc } from "../lib/types";
import { callEstimateFood, logFood } from "../lib/data";

export function StatTile({ label, value, unit, delta, deltaGood, spark, color }: {
  label: string; value: string; unit?: string; delta?: string;
  deltaGood?: boolean | null; spark: (number | null)[]; color: string;
}) {
  return (
    <div className="card span3">
      <div className="label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {delta && (
        <div className={`delta ${deltaGood == null ? "flat" : deltaGood ? "good" : "bad"}`}>{delta}</div>
      )}
      <div style={{ marginTop: 8 }}>
        <Sparkline values={spark} color={color} />
      </div>
    </div>
  );
}

const TL_ICONS = {
  sleep: <IconMoon size={13} />,
  weight: <IconScale size={13} />,
  workout: <IconRun size={13} />,
  activity: <IconRun size={13} />,
  meal: <IconBowl size={13} />,
};

export function Timeline({ events, empty }: { events: TimelineEvent[]; empty: string }) {
  if (events.length === 0) return <div className="muted" style={{ padding: "14px 0", fontSize: 13 }}>{empty}</div>;
  return (
    <div className="timeline">
      {events.map((e, i) => (
        <div className="tl-row" key={i}>
          <div className="tl-time">{e.time}</div>
          <div className="tl-rail">
            <div className={`tl-icon t-${e.type}`}>{TL_ICONS[e.type]}</div>
            <div className="tl-line" />
          </div>
          <div className="tl-body">
            <div className="tl-title">{e.title}</div>
            <div className="tl-sub">{e.sub}</div>
          </div>
          {e.value && (
            <div className="tl-val">
              <b>{e.value}</b>
              <span>{e.valueUnit}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const MACROS: { key: "proteinG" | "carbsG" | "fatG"; name: string; color: string }[] = [
  { key: "proteinG", name: "Protein", color: "var(--emerald)" },
  { key: "carbsG", name: "Carbs", color: "var(--cyan)" },
  { key: "fatG", name: "Fat", color: "var(--indigo)" },
];

export function MacroBars({ totals, goals }: {
  totals: { proteinG: number; carbsG: number; fatG: number };
  goals: UserDoc["dailyGoals"];
}) {
  return (
    <div>
      {MACROS.map((m) => {
        const v = totals[m.key];
        const g = goals[m.key];
        return (
          <div className="macro-row" key={m.key}>
            <div className="name">{m.name}</div>
            <div className="bar">
              <div style={{ width: `${Math.min(100, (v / g) * 100)}%`, background: m.color }} />
            </div>
            <div className="num">{Math.round(v)} / {g} g</div>
          </div>
        );
      })}
    </div>
  );
}

const METRICS: { key: MetricKey; name: string }[] = [
  { key: "weight", name: "Weight" },
  { key: "calories", name: "Calories" },
  { key: "macros", name: "Macros" },
  { key: "sleep", name: "Sleep" },
  { key: "activity", name: "Activity" },
];

export function MetricSwitcher({ value, onChange }: { value: MetricKey; onChange: (m: MetricKey) => void }) {
  return (
    <div className="chips chips-scroll">
      {METRICS.map((m) => (
        <button key={m.key} className={`chip ${value === m.key ? "active" : ""}`} onClick={() => onChange(m.key)}>
          {m.name}
        </button>
      ))}
    </div>
  );
}

export function EstimateCard({ est, uid, onLogged }: { est: Estimate; uid: string; onLogged?: () => void }) {
  const [state, setState] = useState<"idle" | "saving" | "added">("idle");
  const add = async () => {
    setState("saving");
    try {
      await logFood(uid, est);
      setState("added");
      onLogged?.();
    } catch {
      setState("idle");
    }
  };
  return (
    <div className="est-card">
      <div style={{ fontWeight: 700, fontSize: 14 }}>{est.title}</div>
      <div className="est-kcal">{est.kcal} <small style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>kcal</small></div>
      <div className="macro-chips">
        <span className="mchip p">P {est.proteinG}g</span>
        <span className="mchip c">C {est.carbsG}g</span>
        <span className="mchip f">F {est.fatG}g</span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{est.breakdown}</div>
      <button className="btn-grad" style={{ width: "100%" }} disabled={state !== "idle"} onClick={add}>
        {state === "added" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconCheck size={14} /> Added</span>
          : state === "saving" ? "Adding…" : "Add to today"}
      </button>
    </div>
  );
}

export function QuickLogInput({ onEstimate, busy, placeholder }: {
  onEstimate: (text: string, est: Estimate) => void;
  busy: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    const t = text.trim();
    if (!t || pending || busy) return;
    setPending(true);
    setErr(null);
    try {
      const res = await callEstimateFood({ text: t });
      onEstimate(t, res.data);
      setText("");
    } catch (e) {
      setErr((e as Error).message ?? "Estimation failed — try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <div className="qinput">
        <input
          value={text}
          placeholder={placeholder ?? "Describe a meal — '2 eggs, toast with butter and a coffee'"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        <button className="btn-grad" style={{ padding: "9px 13px" }} onClick={go} disabled={pending || busy}>
          {pending ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <IconSend size={15} />}
        </button>
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>{err}</div>}
    </div>
  );
}
