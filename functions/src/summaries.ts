/**
 * DailySummary recomputation and the 30-day aggregate text fed to the AI coach.
 * dailySummaries/{date} is the workhorse document every chart/tile reads.
 */
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export interface DailySummary {
  date: string;
  intakeKcal: number;
  burnedKcal: number;
  netKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sleepDurationMin: number | null;
  sleepScore: number | null;
  steps: number | null;
  activeMin: number | null;
  activeKcal: number | null;
  weightLb: number | null;
  mealsLogged: number;
  workoutCount: number;
  updatedAt: Timestamp;
}

export async function recomputeDay(uid: string, date: string): Promise<DailySummary> {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);

  const [userSnap, foodSnap, workoutSnap, sleepSnap, activitySnap, weightSnap] = await Promise.all([
    userRef.get(),
    userRef.collection("foodLogs").where("date", "==", date).get(),
    userRef.collection("workouts").where("date", "==", date).get(),
    userRef.collection("sleepRecords").doc(date).get(),
    userRef.collection("activityDays").doc(date).get(),
    userRef.collection("weightEntries").doc(date).get(),
  ]);

  const bmr: number = (userSnap.data()?.bmrKcal as number) ?? 1700;

  let intakeKcal = 0, proteinG = 0, carbsG = 0, fatG = 0;
  for (const d of foodSnap.docs) {
    const f = d.data();
    intakeKcal += f.kcal ?? 0;
    proteinG += f.proteinG ?? 0;
    carbsG += f.carbsG ?? 0;
    fatG += f.fatG ?? 0;
  }

  const activity = activitySnap.exists ? activitySnap.data()! : null;
  // Prefer Oura's daily active burn (it already includes workouts);
  // fall back to summing workout calories if activity data is absent.
  let activeKcal = activity?.activeKcal ?? null;
  if (activeKcal == null) {
    let sum = 0;
    for (const d of workoutSnap.docs) sum += d.data().activeKcal ?? 0;
    activeKcal = workoutSnap.size > 0 ? sum : null;
  }

  const burnedKcal = bmr + (activeKcal ?? 0);
  const sleep = sleepSnap.exists ? sleepSnap.data()! : null;

  const summary: DailySummary = {
    date,
    intakeKcal: Math.round(intakeKcal),
    burnedKcal: Math.round(burnedKcal),
    netKcal: Math.round(intakeKcal - burnedKcal),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    sleepDurationMin: sleep?.durationMin ?? null,
    sleepScore: sleep?.score ?? null,
    steps: activity?.steps ?? null,
    activeMin: activity?.activeMin ?? null,
    activeKcal,
    weightLb: weightSnap.exists ? (weightSnap.data()!.weightLb as number) : null,
    mealsLogged: foodSnap.size,
    workoutCount: workoutSnap.size,
    updatedAt: Timestamp.now(),
  };

  await userRef.collection("dailySummaries").doc(date).set(summary, { merge: true });
  return summary;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

/** Build the plain-text 30-day summary the coach prompt consumes. */
export async function buildCoachContext(uid: string): Promise<string> {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const today = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const [userSnap, sumSnap, weightSnap] = await Promise.all([
    userRef.get(),
    userRef.collection("dailySummaries").where("date", ">=", startDate).orderBy("date").get(),
    userRef.collection("weightEntries").orderBy("date", "desc").limit(40).get(),
  ]);

  const u = userSnap.data() ?? {};
  const days = sumSnap.docs.map((d) => d.data() as DailySummary);
  const withFood = days.filter((d) => d.mealsLogged > 0);

  const weights = weightSnap.docs.map((d) => d.data() as { date: string; weightLb: number })
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstW = weights[0]?.weightLb ?? null;
  const lastW = weights[weights.length - 1]?.weightLb ?? null;

  const sleepDays = days.filter((d) => d.sleepDurationMin != null);
  const todaySum = days.find((d) => d.date === today);

  const lines = [
    `User: ${u.name ?? "user"}, sex ${u.sex ?? "?"}, age ${u.age ?? "?"}, height ${u.heightIn ?? "?"} in, BMR ${u.bmrKcal ?? "?"} kcal, resting HR ${u.restingHr ?? "unknown"}.`,
    `Daily goals: ${JSON.stringify(u.dailyGoals ?? {})}. Goal weight ${u.goalWeightLb ?? "?"} lb (start ${u.startWeightLb ?? "?"} lb).`,
    `Weight: latest ${lastW ?? "n/a"} lb, 30-day change ${firstW != null && lastW != null ? r1(lastW - firstW) : "n/a"} lb across ${weights.length} weigh-ins.`,
    `Calories (days with logged food, n=${withFood.length}): avg in ${r1(avg(withFood.map((d) => d.intakeKcal))) ?? "n/a"}, avg out ${r1(avg(withFood.map((d) => d.burnedKcal))) ?? "n/a"}, avg net ${r1(avg(withFood.map((d) => d.netKcal))) ?? "n/a"} kcal/day.`,
    `Macros avg/day: protein ${r1(avg(withFood.map((d) => d.proteinG))) ?? "n/a"} g, carbs ${r1(avg(withFood.map((d) => d.carbsG))) ?? "n/a"} g, fat ${r1(avg(withFood.map((d) => d.fatG))) ?? "n/a"} g.`,
    `Sleep (n=${sleepDays.length}): avg ${r1(avg(sleepDays.map((d) => d.sleepDurationMin!))) ?? "n/a"} min, avg score ${r1(avg(sleepDays.filter((d) => d.sleepScore != null).map((d) => d.sleepScore!))) ?? "n/a"}.`,
    `Activity: avg active min ${r1(avg(days.filter((d) => d.activeMin != null).map((d) => d.activeMin!))) ?? "n/a"}, avg steps ${r1(avg(days.filter((d) => d.steps != null).map((d) => d.steps!))) ?? "n/a"}, workouts in 30d: ${days.reduce((a, d) => a + d.workoutCount, 0)}.`,
    `Today so far: ${todaySum ? `${todaySum.intakeKcal} kcal in (P${todaySum.proteinG}/C${todaySum.carbsG}/F${todaySum.fatG}), ${todaySum.mealsLogged} meals` : "nothing logged yet"}.`,
  ];
  return lines.join("\n");
}
