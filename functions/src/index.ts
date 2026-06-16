/**
 * Aura backend — Cloud Functions (2nd gen).
 *
 * Callables (require the allowlisted Google account):
 *   estimateFood     — free-text meal -> Claude -> {title, kcal, P/C/F, items[]}
 *   generateCoach    — 30-day aggregates -> Claude -> suggestion cards (cached per day)
 *   getOuraAuthUrl   — begins the Oura OAuth flow
 *   disconnectOura   — removes tokens + marks integration disconnected
 *
 * HTTPS:    ouraCallback — OAuth redirect target; exchanges code, stores tokens, first sync
 * Schedule: ouraSync     — every 4 hours, pulls sleep/workouts/activity for connected users
 * Triggers: food/weight/sleep/workout/activity writes -> recompute that day's summary
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import * as crypto from "node:crypto";

import { callClaude, parseJson, ESTIMATE_SYSTEM, coachSystem, ESTIMATE_MODEL, COACH_MODEL } from "./claude";
import { buildAuthUrl, exchangeCode, syncUser } from "./oura";
import { recomputeDay, buildCoachContext } from "./summaries";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 5 });

// ----- configuration ---------------------------------------------------------
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const OURA_CLIENT_ID = defineSecret("OURA_CLIENT_ID");
const OURA_CLIENT_SECRET = defineSecret("OURA_CLIENT_SECRET");
// Set with: firebase functions:config or --set-env during deploy; see README.
const ALLOWED_EMAIL = defineString("ALLOWED_EMAIL");
const APP_URL = defineString("APP_URL"); // e.g. https://jason.github.io/aura/

function requireOwner(req: CallableRequest): string {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const email = (auth.token.email as string | undefined)?.toLowerCase();
  if (!email || email !== ALLOWED_EMAIL.value().toLowerCase() || auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "This Aura instance is private.");
  }
  return auth.uid;
}

// ----- AI: food estimation ---------------------------------------------------
interface Estimate {
  title: string; kcal: number; proteinG: number; carbsG: number; fatG: number;
  breakdown: string;
  items: Array<{ name: string; qty: number; kcal: number; proteinG: number; carbsG: number; fatG: number }>;
  error?: string;
}

export const estimateFood = onCall(
  { secrets: [ANTHROPIC_API_KEY] },
  async (req) => {
    const uid = requireOwner(req);
    const text = String(req.data?.text ?? "").trim().slice(0, 600);
    if (!text) throw new HttpsError("invalid-argument", "Describe the meal first.");

    const raw = await callClaude({
      apiKey: ANTHROPIC_API_KEY.value(),
      model: ESTIMATE_MODEL,
      system: ESTIMATE_SYSTEM,
      user: text,
      maxTokens: 1200,
    });

    let est: Estimate;
    try {
      est = parseJson<Estimate>(raw);
    } catch (e) {
      logger.error("estimateFood: unparseable model output", { raw });
      throw new HttpsError("internal", "Couldn't parse the estimate — try rephrasing the meal.");
    }
    if (est.error === "not_food") {
      throw new HttpsError("invalid-argument", "That didn't look like a meal description.");
    }

    const db = getFirestore();
    const ref = await db.collection(`users/${uid}/estimates`).add({
      ...est,
      sourceText: text,
      createdAt: Timestamp.now(),
    });
    return { estimateId: ref.id, ...est };
  }
);

// ----- AI: coach -------------------------------------------------------------
interface Suggestion { category: string; title: string; detail: string; impact: string }

export const generateCoach = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120 },
  async (req) => {
    const uid = requireOwner(req);
    const refresh = req.data?.refresh === true;
    const today = new Date().toISOString().slice(0, 10);

    const db = getFirestore();
    const cacheRef = db.doc(`users/${uid}/coachSuggestions/${today}`);
    if (!refresh) {
      const cached = await cacheRef.get();
      if (cached.exists) {
        const d = cached.data()!;
        return { items: d.items, generatedAt: d.generatedAt.toMillis(), cached: true };
      }
    }

    const context = await buildCoachContext(uid);
    const raw = await callClaude({
      apiKey: ANTHROPIC_API_KEY.value(),
      model: COACH_MODEL,
      system: coachSystem(),
      user: context,
      maxTokens: 2500,
    });

    let items: Suggestion[];
    try {
      items = parseJson<Suggestion[]>(raw);
      if (!Array.isArray(items) || items.length === 0) throw new Error("empty");
    } catch {
      logger.error("generateCoach: unparseable model output", { raw });
      throw new HttpsError("internal", "Coach response was malformed — hit Regenerate to retry.");
    }

    const generatedAt = Timestamp.now();
    await cacheRef.set({ items, generatedAt, context });
    return { items, generatedAt: generatedAt.toMillis(), cached: false };
  }
);

// ----- Oura OAuth ------------------------------------------------------------
function callbackUrl(): string {
  const project = process.env.GCLOUD_PROJECT;
  return `https://us-central1-${project}.cloudfunctions.net/ouraCallback`;
}

export const getOuraAuthUrl = onCall(
  { secrets: [OURA_CLIENT_ID] },
  async (req) => {
    const uid = requireOwner(req);
    const nonce = crypto.randomBytes(16).toString("hex");
    const db = getFirestore();
    await db.doc(`users/${uid}/private/ouraState`).set({
      nonce,
      createdAt: Timestamp.now(),
    });
    const state = `${uid}.${nonce}`;
    return { url: buildAuthUrl(OURA_CLIENT_ID.value(), callbackUrl(), state) };
  }
);

export const ouraCallback = onRequest(
  { secrets: [OURA_CLIENT_ID, OURA_CLIENT_SECRET] },
  async (req, res) => {
    try {
      const code = String(req.query.code ?? "");
      const state = String(req.query.state ?? "");
      const [uid, nonce] = state.split(".");
      if (!code || !uid || !nonce) throw new Error("Missing code/state.");

      const db = getFirestore();
      const stateSnap = await db.doc(`users/${uid}/private/ouraState`).get();
      if (!stateSnap.exists || stateSnap.data()!.nonce !== nonce) {
        throw new Error("State mismatch — restart the connect flow.");
      }
      await stateSnap.ref.delete();

      const tokens = await exchangeCode({
        code,
        clientId: OURA_CLIENT_ID.value(),
        clientSecret: OURA_CLIENT_SECRET.value(),
        redirectUri: callbackUrl(),
      });
      await db.doc(`users/${uid}/private/oura`).set(tokens);

      // First sync: last 30 days so charts have history immediately.
      const touched = await syncUser(uid, OURA_CLIENT_ID.value(), OURA_CLIENT_SECRET.value(), 30);
      for (const day of touched) await recomputeDay(uid, day);

      res.redirect(`${APP_URL.value()}?oura=connected`);
    } catch (e) {
      logger.error("ouraCallback failed", e as Error);
      res.status(400).send(`Oura connection failed: ${(e as Error).message}`);
    }
  }
);

export const disconnectOura = onCall(async (req) => {
  const uid = requireOwner(req);
  const db = getFirestore();
  await db.doc(`users/${uid}/private/oura`).delete();
  await db.doc(`users/${uid}/integrations/oura`).set(
    { provider: "oura", status: "disconnected", lastSyncedAt: FieldValue.delete() },
    { merge: true }
  );
  return { ok: true };
});

// On-demand sync triggered by the "Sync now" button (same work as the scheduled job).
export const syncOuraNow = onCall(
  { secrets: [OURA_CLIENT_ID, OURA_CLIENT_SECRET], timeoutSeconds: 120 },
  async (req) => {
    const uid = requireOwner(req);
    const db = getFirestore();
    const conn = await db.doc(`users/${uid}/integrations/oura`).get();
    if (!conn.exists || conn.data()?.status !== "connected") {
      throw new HttpsError("failed-precondition", "Oura isn't connected.");
    }
    const touched = await syncUser(uid, OURA_CLIENT_ID.value(), OURA_CLIENT_SECRET.value(), 7);
    for (const day of touched) await recomputeDay(uid, day);
    return { ok: true, days: touched.size };
  }
);

// ----- scheduled sync ---------------------------------------------------------
export const ouraSync = onSchedule(
  { schedule: "every 4 hours", secrets: [OURA_CLIENT_ID, OURA_CLIENT_SECRET], timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    const connected = await db
      .collectionGroup("integrations")
      .where("provider", "==", "oura")
      .where("status", "==", "connected")
      .get();

    for (const doc of connected.docs) {
      const uid = doc.ref.parent.parent!.id;
      try {
        const touched = await syncUser(uid, OURA_CLIENT_ID.value(), OURA_CLIENT_SECRET.value(), 7);
        for (const day of touched) await recomputeDay(uid, day);
        logger.info(`ouraSync ok for ${uid}: ${touched.size} days`);
      } catch (e) {
        logger.error(`ouraSync failed for ${uid}`, e as Error);
      }
    }
  }
);

// ----- summary recompute triggers ----------------------------------------------
// Clients write food/weight directly to Firestore (rules permit only the owner);
// these triggers keep dailySummaries consistent on every add/edit/delete.
function dateFrom(event: { data?: { after?: FirebaseFirestore.DocumentSnapshot; before?: FirebaseFirestore.DocumentSnapshot } }, fallbackId: string): string | null {
  const after = event.data?.after;
  const before = event.data?.before;
  const d =
    (after?.exists ? (after.data()?.date as string | undefined) : undefined) ??
    (before?.exists ? (before.data()?.date as string | undefined) : undefined);
  if (d) return d;
  return /^\d{4}-\d{2}-\d{2}$/.test(fallbackId) ? fallbackId : null;
}

function makeSummaryTrigger(path: string) {
  return onDocumentWritten(`users/{uid}/${path}/{docId}`, async (event) => {
    const date = dateFrom(event, event.params.docId);
    if (!date) return;
    await recomputeDay(event.params.uid, date);
  });
}

export const onFoodWrite = makeSummaryTrigger("foodLogs");
export const onWeightWrite = makeSummaryTrigger("weightEntries");
export const onSleepWrite = makeSummaryTrigger("sleepRecords");
export const onWorkoutWrite = makeSummaryTrigger("workouts");
export const onActivityWrite = makeSummaryTrigger("activityDays");
