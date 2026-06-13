# Aura — Food & Activity Tracker

Private, single-user health tracker. React PWA on **GitHub Pages**, data and auth on **Firebase**, AI (food estimation + coaching) and the **Oura** sync running in **Cloud Functions** so no API keys ever reach the browser.

```
GitHub Pages (static PWA)
   │  Firebase JS SDK
   ├── Firebase Auth (Google, allowlisted to one account)
   ├── Firestore (realtime + offline cache)
   └── Cloud Functions
         ├── estimateFood   → Claude (Haiku)
         ├── generateCoach  → Claude (Sonnet), cached per day
         ├── getOuraAuthUrl / ouraCallback / disconnectOura
         ├── ouraSync       → every 4 hours
         └── Firestore triggers → recompute dailySummaries
```

## Repo layout

| Path | What it is |
|---|---|
| `app/` | Vite + React PWA (deployed to GitHub Pages by CI) |
| `functions/` | Cloud Functions (TypeScript, Node 20) |
| `firestore.rules` | Owner-only rules + client-unreadable `private/` subcollection |
| `.github/workflows/deploy.yml` | Builds the app and publishes to Pages on push to `main` |

## Setup (one-time, ~30 minutes)

### 1. Firebase project
1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (Analytics optional).
2. **Upgrade to the Blaze plan** (required for Functions to call the Anthropic & Oura APIs; cost is effectively pennies at single-user volume).
3. **Build → Authentication → Get started → Google** → enable.
4. **Build → Firestore Database → Create database** (production mode, `us-central1` recommended to match the functions region).
5. **Project settings → Your apps → Web (`</>`)** → register an app, copy the `firebaseConfig` block.

### 2. Fill in the placeholders
- `app/src/lib/config.ts` → paste `firebaseConfig`, set `ALLOWED_EMAIL` to your Google account.
- `firestore.rules` → replace `YOUR_EMAIL@gmail.com` with the same email.
- `.firebaserc` → replace `YOUR-FIREBASE-PROJECT-ID`.

### 3. Deploy the backend
```bash
npm install -g firebase-tools
firebase login
cd functions && npm install && cd ..

firebase functions:secrets:set ANTHROPIC_API_KEY     # from console.anthropic.com
firebase functions:secrets:set OURA_CLIENT_ID        # see step 4 (set a dummy now, re-set later if needed)
firebase functions:secrets:set OURA_CLIENT_SECRET

firebase deploy
```
On first deploy you'll be prompted for two params — set:
- `ALLOWED_EMAIL` = your Google account email
- `APP_URL` = your Pages URL, e.g. `https://USERNAME.github.io/REPO-NAME/`

### 4. Oura OAuth app
1. [cloud.ouraring.com/oauth/applications](https://cloud.ouraring.com/oauth/applications) → **New application**.
2. Redirect URI: `https://us-central1-YOUR-FIREBASE-PROJECT-ID.cloudfunctions.net/ouraCallback`
3. Copy the client ID/secret into the two secrets above (`firebase functions:secrets:set …` again, then `firebase deploy --only functions`).

### 5. GitHub Pages
1. Push this repo to GitHub (branch `main`). Run `npm install` once inside `app/` first so `package-lock.json` is committed (CI uses `npm ci`).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Push — the workflow builds and publishes. Your app is at `https://USERNAME.github.io/REPO-NAME/`.
4. Firebase console → **Authentication → Settings → Authorized domains** → add `USERNAME.github.io`.

### 6. Install on your phone
Open the Pages URL in Chrome on the phone → menu → **Add to home screen / Install app**. It runs standalone, works offline (Firestore local cache), and queued writes sync when you're back online.

## Using it
- **Log food**: type a meal in plain language anywhere there's an input ("2 eggs, toast with butter, black coffee") → review the estimate → **Add to today**.
- **Weight**: Profile → stepper → Log. One entry per day; re-logging overwrites.
- **Oura**: Profile → Connect → approve. First sync backfills 30 days; a scheduled job refreshes the last 7 days every 4 hours.
- **Coach**: generates automatically on first open each day (cached); **Regenerate** forces a fresh read of your last 30 days.

## Notes
- Firestore rules deny everything except your account, and deny the `users/*/private/*` path (Oura tokens) to **all** clients — only Functions can read it.
- The Anthropic key exists solely as a Functions secret.
- Net calories = intake − (BMR + Oura active calories). BMR recomputes (Mifflin-St Jeor) when you save the baseline card in Profile.
- Models: food estimates use Claude Haiku 4.5; the coach uses Claude Sonnet 4.6. Both configurable in `functions/src/claude.ts`.
