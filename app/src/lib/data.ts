import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, onSnapshot, orderBy, query, where, limit,
  setDoc, addDoc, deleteDoc, getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { dateKey, daysAgoKey, fmtMinutes, fmtTime } from "./dates";
import type {
  UserDoc, FoodLog, WeightEntry, SleepRecord, Nap, Workout, DailySummary,
  Integration, Estimate, CoachItem, MetricKey, TimelineEvent,
} from "./types";

// ---------- callables ----------
export const callEstimateFood = httpsCallable<{ text: string }, Estimate>(functions, "estimateFood");
export const callGenerateCoach = httpsCallable<{ refresh?: boolean }, { items: CoachItem[]; generatedAt: number; cached: boolean }>(functions, "generateCoach");
export const callGetOuraAuthUrl = httpsCallable<unknown, { url: string }>(functions, "getOuraAuthUrl");
export const callDisconnectOura = httpsCallable(functions, "disconnectOura");
export const callSyncOuraNow = httpsCallable<unknown, { ok: boolean; days: number }>(functions, "syncOuraNow");

export const METRIC_LABEL: Record<MetricKey, string> = {
  weight: "Weight",
  calories: "Calories",
  macros: "Protein",
  sleep: "Sleep",
  activity: "Activity",
};

// ---------- generic listeners ----------
function useDocData<T>(path: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!path) return;
    return onSnapshot(doc(db, path), (s) => setData(s.exists() ? (s.data() as T) : null));
  }, [path]);
  return data;
}

export function useUserDoc(uid: string): UserDoc | null {
  return useDocData<UserDoc>(`users/${uid}`);
}

export function useTodayFood(uid: string): FoodLog[] {
  const [rows, setRows] = useState<FoodLog[]>([]);
  const today = dateKey();
  useEffect(() => {
    const q = query(collection(db, `users/${uid}/foodLogs`), where("date", "==", today));
    return onSnapshot(q, (s) => {
      const r = s.docs.map((d) => ({ id: d.id, ...(d.data() as FoodLog) }));
      r.sort((a, b) => a.loggedAt - b.loggedAt);
      setRows(r);
    });
  }, [uid, today]);
  return rows;
}

export function useSummaries(uid: string, days: number): DailySummary[] {
  const [rows, setRows] = useState<DailySummary[]>([]);
  const start = daysAgoKey(days - 1);
  useEffect(() => {
    const q = query(
      collection(db, `users/${uid}/dailySummaries`),
      where("date", ">=", start),
      orderBy("date", "asc")
    );
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => d.data() as DailySummary)));
  }, [uid, start]);
  return rows;
}

export function useWeights(uid: string, max = 60): WeightEntry[] {
  const [rows, setRows] = useState<WeightEntry[]>([]);
  useEffect(() => {
    const q = query(collection(db, `users/${uid}/weightEntries`), orderBy("date", "desc"), limit(max));
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => d.data() as WeightEntry)));
  }, [uid, max]);
  return rows;
}

export function useIntegrations(uid: string): Integration[] {
  const [rows, setRows] = useState<Integration[]>([]);
  useEffect(() => {
    return onSnapshot(collection(db, `users/${uid}/integrations`), (s) =>
      setRows(s.docs.map((d) => d.data() as Integration))
    );
  }, [uid]);
  return rows;
}

interface DayBundle {
  sleep: SleepRecord | null;
  naps: Nap[];
  workouts: Workout[];
  food: FoodLog[];
  weight: WeightEntry | null;
}

export function useDayBundle(uid: string, date: string): DayBundle {
  const [sleep, setSleep] = useState<SleepRecord | null>(null);
  const [naps, setNaps] = useState<Nap[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [food, setFood] = useState<FoodLog[]>([]);
  const [weight, setWeight] = useState<WeightEntry | null>(null);

  useEffect(() => {
    const subs = [
      onSnapshot(doc(db, `users/${uid}/sleepRecords/${date}`), (s) =>
        setSleep(s.exists() ? (s.data() as SleepRecord) : null)
      ),
      onSnapshot(query(collection(db, `users/${uid}/naps`), where("date", "==", date)), (s) =>
        setNaps(s.docs.map((d) => ({ id: d.id, ...(d.data() as Nap) })))
      ),
      onSnapshot(query(collection(db, `users/${uid}/workouts`), where("date", "==", date)), (s) =>
        setWorkouts(s.docs.map((d) => ({ id: d.id, ...(d.data() as Workout) })))
      ),
      onSnapshot(query(collection(db, `users/${uid}/foodLogs`), where("date", "==", date)), (s) =>
        setFood(s.docs.map((d) => ({ id: d.id, ...(d.data() as FoodLog) })))
      ),
      onSnapshot(doc(db, `users/${uid}/weightEntries/${date}`), (s) =>
        setWeight(s.exists() ? (s.data() as WeightEntry) : null)
      ),
    ];
    return () => subs.forEach((u) => u());
  }, [uid, date]);

  return { sleep, naps, workouts, food, weight };
}

// ---------- timeline assembly (the Oura-style day rail) ----------
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function buildTimeline(b: DayBundle): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  if (b.sleep) {
    const wake = new Date(b.sleep.wakeTime);
    const asleep = b.sleep.bedtime ? new Date(b.sleep.bedtime) : null;
    const asleepStr = asleep && !isNaN(asleep.getTime())
      ? asleep.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;
    ev.push({
      time: hhmm(wake), sortKey: wake.getTime(), type: "sleep", title: "Woke up",
      sub: `Oura · slept ${fmtMinutes(b.sleep.durationMin)}${asleepStr ? ` since ${asleepStr}` : ""}${b.sleep.score != null ? ` · score ${b.sleep.score}` : ""}`,
      value: b.sleep.score != null ? String(b.sleep.score) : undefined,
      valueUnit: b.sleep.score != null ? "score" : undefined,
    });
  }
  if (b.weight) {
    const t = new Date(b.weight.loggedAt);
    ev.push({
      time: hhmm(t), sortKey: b.weight.loggedAt, type: "weight", title: "Morning weigh-in",
      sub: b.weight.source === "manual" ? "Logged manually" : b.weight.source,
      value: b.weight.weightLb.toFixed(1), valueUnit: "lb",
    });
  }
  for (const w of b.workouts) {
    const t = new Date(w.start);
    const name = w.type.replace(/_/g, " ");
    ev.push({
      time: hhmm(t), sortKey: t.getTime(), type: "workout",
      title: name.charAt(0).toUpperCase() + name.slice(1),
      sub: `${w.source === "oura" ? "Oura · " : ""}${w.distanceKm ? `${w.distanceKm} km · ` : ""}${w.durationMin} min`,
      value: w.activeKcal != null ? String(w.activeKcal) : undefined,
      valueUnit: w.activeKcal != null ? "kcal" : undefined,
    });
  }
  for (const f of b.food) {
    const t = new Date(f.loggedAt);
    ev.push({
      time: hhmm(t), sortKey: f.loggedAt, type: "meal",
      title: f.mealType ? f.mealType.charAt(0).toUpperCase() + f.mealType.slice(1) : "Meal",
      sub: f.title, value: String(f.kcal), valueUnit: "kcal",
    });
  }
  for (const n of b.naps ?? []) {
    const t = new Date(n.end);
    const startStr = n.start
      ? new Date(n.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;
    ev.push({
      time: hhmm(t), sortKey: t.getTime(), type: "sleep", title: "Nap",
      sub: `Oura · napped ${fmtMinutes(n.durationMin)}${startStr ? ` since ${startStr}` : ""}`,
      value: undefined, valueUnit: undefined,
    });
  }
  ev.sort((a, b2) => a.sortKey - b2.sortKey);
  return ev;
}

// ---------- writes (rules restrict to the owner; triggers recompute summaries) ----------
export async function logFood(uid: string, est: Estimate, mealType?: FoodLog["mealType"]) {
  const now = Date.now();
  const log: FoodLog = {
    date: dateKey(), loggedAt: now, title: est.title,
    kcal: est.kcal, proteinG: est.proteinG, carbsG: est.carbsG, fatG: est.fatG,
    items: est.items ?? [],
    ...(est.estimateId ? { estimateId: est.estimateId } : {}),
    ...(mealType ? { mealType } : {}),
  };
  await addDoc(collection(db, `users/${uid}/foodLogs`), log);
}

export async function deleteFood(uid: string, id: string) {
  await deleteDoc(doc(db, `users/${uid}/foodLogs/${id}`));
}

export async function logWeight(uid: string, weightLb: number) {
  const date = dateKey();
  const entry: WeightEntry = { date, weightLb, loggedAt: Date.now(), source: "manual" };
  await setDoc(doc(db, `users/${uid}/weightEntries/${date}`), entry);
}

export async function ensureUserDoc(uid: string, email: string, name: string) {
  const ref = doc(db, `users/${uid}`);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const defaults: UserDoc = {
    name, email,
    heightIn: 71, age: 45, sex: "male",
    bmrKcal: 1700, restingHr: null,
    goalWeightLb: 168, startWeightLb: 182,
    dailyGoals: { kcal: 2100, proteinG: 150, carbsG: 210, fatG: 70 },
  };
  await setDoc(ref, defaults);
}

export async function saveProfile(uid: string, patch: Partial<UserDoc>) {
  await setDoc(doc(db, `users/${uid}`), patch, { merge: true });
}

// ---------- metric series for charts ----------
export interface Series { label: string; color: string; points: { date: string; value: number | null }[] }

export function metricSeries(
  metric: MetricKey,
  summaries: DailySummary[],
  weights: WeightEntry[],
  days: number
): { series: Series[]; unit: string } {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(daysAgoKey(i));
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  const wByDate = new Map(weights.map((w) => [w.date, w]));
  const pick = (f: (s: DailySummary) => number | null) =>
    keys.map((k) => {
      const s = byDate.get(k);
      return { date: k, value: s ? f(s) : null };
    });

  switch (metric) {
    case "weight":
      return {
        unit: "lb",
        series: [{
          label: "Weight", color: "var(--teal)",
          points: keys.map((k) => ({ date: k, value: wByDate.get(k)?.weightLb ?? null })),
        }],
      };
    case "calories":
      return {
        unit: "kcal",
        series: [
          { label: "In", color: "var(--emerald)", points: pick((s) => (s.mealsLogged > 0 ? s.intakeKcal : null)) },
          { label: "Out", color: "var(--cyan)", points: pick((s) => s.burnedKcal) },
        ],
      };
    case "macros":
      return {
        unit: "g",
        series: [{ label: "Protein", color: "var(--emerald)", points: pick((s) => (s.mealsLogged > 0 ? s.proteinG : null)) }],
      };
    case "sleep":
      return {
        unit: "min",
        series: [{ label: "Sleep", color: "var(--indigo)", points: pick((s) => s.sleepDurationMin) }],
      };
    case "activity":
      return {
        unit: "min",
        series: [{ label: "Active", color: "var(--cyan)", points: pick((s) => s.activeMin) }],
      };
  }
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setM(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [q]);
  return m;
}

export function useMemoSeries(metric: MetricKey, summaries: DailySummary[], weights: WeightEntry[], days: number) {
  return useMemo(() => metricSeries(metric, summaries, weights, days), [metric, summaries, weights, days]);
}
