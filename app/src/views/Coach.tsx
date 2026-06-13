import { useEffect, useState } from "react";
import { IconRefresh } from "../components/Icons";
import { callGenerateCoach } from "../lib/data";
import { timeAgo } from "../lib/dates";
import type { CoachItem } from "../lib/types";

type Filter = "All" | "Diet" | "Workouts" | "Health";

export default function Coach({ uid: _uid }: { uid: string }) {
  const [items, setItems] = useState<CoachItem[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");

  const run = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await callGenerateCoach({ refresh });
      setItems(res.data.items);
      setGeneratedAt(res.data.generatedAt);
    } catch (e) {
      setError((e as Error).message || "Coach generation failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run(false); // auto-generate on first open; cached per day server-side
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = (items ?? []).filter((i) => filter === "All" || i.category === filter);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.3px" }}>Personalized suggestions from Aura</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Built from your last 30 days of meals, weight, sleep and activity.
            {generatedAt && <span className="faint"> · Generated {timeAgo(generatedAt)}</span>}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => run(true)} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <IconRefresh size={14} /> Regenerate
        </button>
      </div>

      <div className="chips" style={{ marginBottom: 16 }}>
        {(["All", "Diet", "Workouts", "Health"] as Filter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {loading && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="spinner" />
            <span className="muted" style={{ fontSize: 13 }}>Reading your last 30 days…</span>
          </div>
          <div className="coach-grid">
            {[0, 1, 2, 3].map((i) => <div className="skeleton" key={i} />)}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Couldn't reach your coach</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
          <button className="btn-grad" onClick={() => run(true)}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="coach-grid">
          {shown.map((s, i) => (
            <div className="card" key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span className={`cat-badge cat-${s.category}`}>{s.category}</span>
                <span style={{ flex: 1 }} />
                <span className={`impact ${s.impact}`}>{s.impact}</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.2px", marginBottom: 6 }}>{s.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>{s.detail}</div>
            </div>
          ))}
          {shown.length === 0 && (
            <div className="muted" style={{ gridColumn: "1 / -1", fontSize: 13 }}>
              Nothing in this category yet — log a few more days of data and regenerate.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
