import { useEffect, useState } from "react";
import { IconRing } from "../components/Icons";
import {
  useWeights, useIntegrations, logWeight, saveProfile,
  callGetOuraAuthUrl, callDisconnectOura,
} from "../lib/data";
import { prettyDate, timeAgo } from "../lib/dates";
import type { UserDoc } from "../lib/types";

export default function Profile({ uid, user }: { uid: string; user: UserDoc }) {
  const weights = useWeights(uid, 30);
  const integrations = useIntegrations(uid);
  const latest = weights[0]?.weightLb ?? user.startWeightLb;
  const [draft, setDraft] = useState(latest);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => setDraft(latest), [latest]);

  const oura = integrations.find((i) => i.provider === "oura");
  const progress = Math.max(0, Math.min(1,
    (user.startWeightLb - latest) / Math.max(0.1, user.startWeightLb - user.goalWeightLb)
  ));

  const doLog = async () => {
    setSaving(true);
    try { await logWeight(uid, Math.round(draft * 10) / 10); } finally { setSaving(false); }
  };

  const connectOura = async () => {
    setConnecting(true);
    try {
      const res = await callGetOuraAuthUrl({});
      window.location.href = res.data.url;
    } catch (e) {
      alert((e as Error).message);
      setConnecting(false);
    }
  };

  const [form, setForm] = useState({
    heightIn: user.heightIn, age: user.age, goalWeightLb: user.goalWeightLb,
    kcal: user.dailyGoals.kcal, proteinG: user.dailyGoals.proteinG,
    carbsG: user.dailyGoals.carbsG, fatG: user.dailyGoals.fatG,
  });
  const [savedFlash, setSavedFlash] = useState(false);
  const saveBaseline = async () => {
    // Mifflin-St Jeor with the latest weight; sex from the profile.
    const kg = latest * 0.4536, cm = form.heightIn * 2.54;
    const bmr = Math.round(10 * kg + 6.25 * cm - 5 * form.age + (user.sex === "male" ? 5 : -161));
    await saveProfile(uid, {
      heightIn: Number(form.heightIn), age: Number(form.age),
      goalWeightLb: Number(form.goalWeightLb), bmrKcal: bmr,
      dailyGoals: {
        kcal: Number(form.kcal), proteinG: Number(form.proteinG),
        carbsG: Number(form.carbsG), fatG: Number(form.fatG),
      },
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  return (
    <div className="grid12">
      <div className="card span4">
        <div className="label">Log weight</div>
        <div className="stepper">
          <button onClick={() => setDraft((d) => Math.round((d - 0.1) * 10) / 10)}>−</button>
          <div className="val">{draft.toFixed(1)}<small style={{ fontSize: 15, color: "var(--muted)" }}> lb</small></div>
          <button onClick={() => setDraft((d) => Math.round((d + 0.1) * 10) / 10)}>+</button>
        </div>
        <button className="btn-grad" style={{ width: "100%" }} onClick={doLog} disabled={saving}>
          {saving ? "Logging…" : `Log ${draft.toFixed(1)} lb`}
        </button>
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            <span>Start {user.startWeightLb} lb</span>
            <span>Goal {user.goalWeightLb} lb</span>
          </div>
          <div className="bar" style={{ height: 9 }}>
            <div style={{ width: `${progress * 100}%`, background: "var(--grad)" }} />
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            {Math.round(progress * 100)}% of the way · {(latest - user.goalWeightLb).toFixed(1)} lb to go
          </div>
        </div>
      </div>

      <div className="card span4">
        <div className="label">Connected sources</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <div className="tl-icon t-sleep" style={{ width: 36, height: 36 }}><IconRing size={17} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Oura Ring</div>
            <div className="faint" style={{ fontSize: 12 }}>
              {oura?.status === "connected"
                ? `Connected${oura.lastSyncedAt ? ` · synced ${timeAgo(oura.lastSyncedAt.toMillis())}` : ""}`
                : "Sleep, workouts & activity"}
            </div>
          </div>
          {oura?.status === "connected" ? (
            <button className="btn-ghost" onClick={() => callDisconnectOura({})}>Disconnect</button>
          ) : (
            <button className="btn-grad" onClick={connectOura} disabled={connecting}>
              {connecting ? "Opening…" : "Connect"}
            </button>
          )}
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 16 }}>
          Background sync runs every 4 hours and pulls sleep, workouts and daily activity into your timeline.
        </div>
      </div>

      <div className="card span4 row2">
        <div className="label">Recent weigh-ins</div>
        <div style={{ marginTop: 8 }}>
          {weights.length === 0 && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>No weigh-ins yet.</div>}
          {weights.map((w, i) => {
            const prev = weights[i + 1];
            const d = prev ? w.weightLb - prev.weightLb : null;
            return (
              <div className="weigh-row" key={w.date}>
                <span className="muted">{prettyDate(w.date)}</span>
                <span>
                  <b>{w.weightLb.toFixed(1)}</b>
                  {d != null && (
                    <span className={`delta ${d <= 0 ? "good" : "bad"}`} style={{ marginLeft: 8 }}>
                      {d > 0 ? "+" : ""}{d.toFixed(1)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card span8">
        <div className="label">Body & baseline</div>
        <div className="baseline-grid">
          <div className="cell">
            <div className="label">BMR (computed)</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{user.bmrKcal} kcal</div>
          </div>
          <div className="cell">
            <div className="label">Resting HR</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{user.restingHr ?? "—"}{user.restingHr ? " bpm" : ""}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          {([
            ["Height (in)", "heightIn"], ["Age", "age"], ["Goal weight (lb)", "goalWeightLb"],
            ["Daily kcal goal", "kcal"], ["Protein goal (g)", "proteinG"], ["Carb goal (g)", "carbsG"], ["Fat goal (g)", "fatG"],
          ] as const).map(([label, key]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="number"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>
        <button className="btn-grad" style={{ marginTop: 16 }} onClick={saveBaseline}>
          {savedFlash ? "Saved" : "Save baseline"}
        </button>
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
          Saving recomputes your BMR (Mifflin-St Jeor) from height, age and your latest weight.
        </div>
      </div>
    </div>
  );
}
