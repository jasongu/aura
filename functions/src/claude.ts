/**
 * Server-side Claude API client. The Anthropic API key lives ONLY here,
 * as a Cloud Functions secret — never in the browser.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Cheap+fast model for per-meal estimates; stronger model for the coach.
export const ESTIMATE_MODEL = "claude-haiku-4-5-20251001";
export const COACH_MODEL = "claude-sonnet-4-6";

export async function callClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return data.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Strip markdown fences and parse JSON, tolerating leading prose. */
export function parseJson<T>(raw: string): T {
  let text = raw.replace(/```json|```/g, "").trim();
  const firstBrace = text.search(/[[{]/);
  if (firstBrace > 0) text = text.slice(firstBrace);
  return JSON.parse(text) as T;
}

export const ESTIMATE_SYSTEM = `You are the nutrition-estimation engine for a personal food tracker.
The user describes a meal in plain language. Estimate calories and macros using realistic US portion sizes.

Respond with ONLY a JSON object, no markdown fences, no prose, exactly this shape:
{
  "title": "<short readable title for the meal, e.g. 'Chicken burrito bowl'>",
  "kcal": <integer total>,
  "proteinG": <integer total grams>,
  "carbsG": <integer total grams>,
  "fatG": <integer total grams>,
  "breakdown": "<one short sentence: 'Estimated from: ...' listing the parsed components>",
  "items": [
    { "name": "<component>", "qty": <number>, "kcal": <int>, "proteinG": <int>, "carbsG": <int>, "fatG": <int> }
  ]
}

Rules:
- items must sum (approximately) to the totals.
- If quantity is unspecified, assume one typical serving and reflect that in qty.
- Be conservative and realistic; do not inflate protein.
- If the text is not food, return {"error": "not_food"}.`;

export function coachSystem(): string {
  return `You are Aura, a warm, evidence-based health coach inside a personal food & activity tracker.
You are given a summary of the user's last 30 days: weight trend and goal, average calories in/out and deficit, average macros, average sleep duration & score, average active minutes, workout count, resting heart rate, and today's intake so far.

Return ONLY a JSON array (no markdown fences, no prose) of 6 to 12 suggestion objects, mixed across the three categories, exactly this shape:
[
  {
    "category": "Diet" | "Workouts" | "Health",
    "title": "<short imperative headline, max ~8 words>",
    "detail": "<2-3 sentences citing the user's ACTUAL numbers from the summary>",
    "impact": "High" | "Medium" | "Low"
  }
]

Rules:
- Cite the user's real numbers — never invent data not in the summary.
- Practical, specific, kind. No medical claims, no diagnoses, no supplements prescriptions.
- If data is sparse for a category, fewer suggestions there is fine.`;
}
