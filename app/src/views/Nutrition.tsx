import { useState } from "react";
import { Ring } from "../components/Charts";
import { MacroBars, QuickLogInput, EstimateCard } from "../components/Widgets";
import { IconTrash } from "../components/Icons";
import { useTodayFood, deleteFood } from "../lib/data";
import type { Estimate, UserDoc } from "../lib/types";

interface Msg { role: "user" | "ai" | "est"; text?: string; est?: Estimate }

export default function Nutrition({ uid, user }: { uid: string; user: UserDoc }) {
  const todayFood = useTodayFood(uid);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "ai", text: "Tell me what you ate and I'll estimate the calories and macros. Confirm with 'Add to today' to log it." },
  ]);

  const totals = todayFood.reduce(
    (a, f) => ({ kcal: a.kcal + f.kcal, proteinG: a.proteinG + f.proteinG, carbsG: a.carbsG + f.carbsG, fatG: a.fatG + f.fatG }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  return (
    <div className="grid12">
      <div className="card span8" style={{ display: "flex", flexDirection: "column", minHeight: 480 }}>
        <div className="label" style={{ marginBottom: 12 }}>AI food log</div>
        <div className="chat" style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div className="bubble-user" key={i}>{m.text}</div>
            ) : m.role === "ai" ? (
              <div className="bubble-ai" key={i}>{m.text}</div>
            ) : (
              <EstimateCard key={i} est={m.est!} uid={uid} />
            )
          )}
        </div>
        <QuickLogInput
          busy={false}
          onEstimate={(text, est) =>
            setMsgs((prev) => [...prev, { role: "user", text }, { role: "est", est }])
          }
        />
      </div>

      <div className="span4" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="label" style={{ alignSelf: "flex-start" }}>Today's intake</div>
          <div style={{ margin: "10px 0 4px" }}>
            <Ring value={totals.kcal} goal={user.dailyGoals.kcal} />
          </div>
          <div style={{ width: "100%" }}>
            <MacroBars totals={totals} goals={user.dailyGoals} />
          </div>
        </div>

        <div className="card">
          <div className="label">Logged today</div>
          {todayFood.length === 0 && (
            <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>No meals yet — describe one in the chat.</div>
          )}
          {todayFood.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>P {f.proteinG} · C {f.carbsG} · F {f.fatG}</div>
              </div>
              <b style={{ fontSize: 13 }}>{f.kcal}</b>
              <button
                aria-label="Delete meal"
                onClick={() => f.id && deleteFood(uid, f.id)}
                style={{ background: "transparent", border: "none", color: "var(--faint)", padding: 4 }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
