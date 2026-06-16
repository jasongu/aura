export interface UserDoc {
  name: string;
  email: string;
  heightIn: number;
  age: number;
  sex: "male" | "female";
  bmrKcal: number;
  restingHr: number | null;
  goalWeightLb: number;
  startWeightLb: number;
  dailyGoals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}

export interface FoodItem {
  name: string;
  qty: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Estimate {
  estimateId?: string;
  title: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  breakdown: string;
  items: FoodItem[];
}

export interface FoodLog {
  id?: string;
  date: string;
  loggedAt: number;
  title: string;
  mealType?: "breakfast" | "lunch" | "snack" | "dinner";
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items?: FoodItem[];
  estimateId?: string;
}

export interface WeightEntry {
  date: string;
  weightLb: number;
  loggedAt: number;
  source: string;
}

export interface SleepRecord {
  date: string;
  bedtime: string;
  wakeTime: string;
  durationMin: number;
  score: number | null;
}

export interface Nap {
  id?: string;
  date: string;
  start: string;
  end: string;
  durationMin: number;
  source: string;
}

export interface Workout {
  id?: string;
  date: string;
  start: string;
  end?: string;
  type: string;
  distanceKm: number | null;
  durationMin: number;
  activeKcal: number | null;
  source: string;
}

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
}

export interface Integration {
  provider: string;
  status: "connected" | "disconnected";
  lastSyncedAt?: { toMillis(): number };
  scopes?: string;
}

export interface CoachItem {
  category: "Diet" | "Workouts" | "Health";
  title: string;
  detail: string;
  impact: "High" | "Medium" | "Low";
}

export type MetricKey = "weight" | "calories" | "macros" | "sleep" | "activity";

export interface TimelineEvent {
  time: string; // HH:MM
  sortKey: number;
  type: "sleep" | "weight" | "workout" | "meal" | "activity";
  title: string;
  sub: string;
  value?: string;
  valueUnit?: string;
}
