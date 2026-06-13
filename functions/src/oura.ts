/**
 * Oura Cloud API v2 integration: OAuth token exchange/refresh and
 * pulling sleep, workouts, and daily activity into Firestore.
 * Tokens are stored under users/{uid}/private/oura (client-unreadable).
 */
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const API = "https://api.ouraring.com/v2/usercollection";
export const OURA_SCOPES = "personal daily workout";

export interface OuraTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Timestamp;
}

export function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OURA_SCOPES,
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<OuraTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`Oura token endpoint ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Timestamp.fromMillis(Date.now() + (data.expires_in - 120) * 1000),
  };
}

export function exchangeCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OuraTokens> {
  return tokenRequest({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
  });
}

/** Returns a valid access token, refreshing + persisting if expired. */
export async function freshAccessToken(
  uid: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const db = getFirestore();
  const ref = db.doc(`users/${uid}/private/oura`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`No Oura tokens for ${uid}`);
  const tok = snap.data() as OuraTokens;
  if (tok.expiresAt.toMillis() > Date.now()) return tok.accessToken;

  const next = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: tok.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  await ref.set(next, { merge: true });
  return next.accessToken;
}

async function ouraGet<T>(token: string, path: string, start: string, end: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  do {
    const q = new URLSearchParams({ start_date: start, end_date: end });
    if (next) q.set("next_token", next);
    const res = await fetch(`${API}/${path}?${q.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Oura ${path} ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { data: T[]; next_token: string | null };
    out.push(...data.data);
    next = data.next_token;
  } while (next);
  return out;
}

interface DailySleep { day: string; score: number | null }
interface SleepPeriod {
  day: string; bedtime_start: string; bedtime_end: string;
  total_sleep_duration: number | null; type: string;
}
interface OuraWorkout {
  id: string; day: string; activity: string; calories: number | null;
  distance: number | null; start_datetime: string; end_datetime: string; source: string;
}
interface DailyActivity {
  day: string; steps: number | null; active_calories: number | null;
  high_activity_time: number | null; medium_activity_time: number | null; low_activity_time: number | null;
}

/**
 * Pull the last `days` days of Oura data for one user into Firestore.
 * Returns the set of day-keys touched so callers can recompute summaries.
 */
export async function syncUser(
  uid: string,
  clientId: string,
  clientSecret: string,
  days = 7
): Promise<Set<string>> {
  const db = getFirestore();
  const token = await freshAccessToken(uid, clientId, clientSecret);

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [s, e] = [iso(start), iso(end)];

  const [dailySleep, sleepPeriods, workouts, activity] = await Promise.all([
    ouraGet<DailySleep>(token, "daily_sleep", s, e),
    ouraGet<SleepPeriod>(token, "sleep", s, e),
    ouraGet<OuraWorkout>(token, "workout", s, e),
    ouraGet<DailyActivity>(token, "daily_activity", s, e),
  ]);

  const touched = new Set<string>();
  const batch = db.batch();

  // Longest sleep period per day = the night's sleep; daily_sleep supplies the score.
  const scoreByDay = new Map(dailySleep.map((d) => [d.day, d.score]));
  const longestByDay = new Map<string, SleepPeriod>();
  for (const p of sleepPeriods) {
    if (p.type === "rest") continue;
    const cur = longestByDay.get(p.day);
    if (!cur || (p.total_sleep_duration ?? 0) > (cur.total_sleep_duration ?? 0)) {
      longestByDay.set(p.day, p);
    }
  }
  for (const [day, p] of longestByDay) {
    touched.add(day);
    batch.set(
      db.doc(`users/${uid}/sleepRecords/${day}`),
      {
        date: day,
        bedtime: p.bedtime_start,
        wakeTime: p.bedtime_end,
        durationMin: Math.round((p.total_sleep_duration ?? 0) / 60),
        score: scoreByDay.get(day) ?? null,
        source: "oura",
      },
      { merge: true }
    );
  }

  for (const w of workouts) {
    touched.add(w.day);
    batch.set(
      db.doc(`users/${uid}/workouts/oura_${w.id}`),
      {
        date: w.day,
        start: w.start_datetime,
        end: w.end_datetime,
        type: w.activity,
        distanceKm: w.distance != null ? Math.round((w.distance / 1000) * 100) / 100 : null,
        durationMin: Math.round(
          (new Date(w.end_datetime).getTime() - new Date(w.start_datetime).getTime()) / 60000
        ),
        activeKcal: w.calories != null ? Math.round(w.calories) : null,
        source: "oura",
      },
      { merge: true }
    );
  }

  for (const a of activity) {
    touched.add(a.day);
    const activeMin = Math.round(
      ((a.high_activity_time ?? 0) + (a.medium_activity_time ?? 0)) / 60
    );
    batch.set(
      db.doc(`users/${uid}/activityDays/${a.day}`),
      {
        date: a.day,
        steps: a.steps ?? 0,
        activeKcal: a.active_calories != null ? Math.round(a.active_calories) : 0,
        activeMin,
        source: "oura",
      },
      { merge: true }
    );
  }

  batch.set(
    db.doc(`users/${uid}/integrations/oura`),
    { provider: "oura", status: "connected", lastSyncedAt: Timestamp.now(), scopes: OURA_SCOPES },
    { merge: true }
  );

  await batch.commit();
  return touched;
}
