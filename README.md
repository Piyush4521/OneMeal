# OneMeal

OneMeal is a Firebase-backed food donation app with donor, NGO, volunteer, admin, and recipe flows. The frontend is a Vite/React app; privileged actions are now backed by Firestore rules and Firebase Functions instead of trusting the browser.

## What it does

- Donors list food donations with AI-assisted food-image validation and packing tips.
- NGOs claim available donations, receive a server-generated OTP, and report bad listings with a reason.
- Volunteers can accept, complete, or release pickups through callable backend actions.
- Admins manage users, issues, announcements, donations, and money pledges.
- Recipe Hub generates recipe ideas from pantry items or diet goals.

## Important implementation notes

- Gemini is proxied through Firebase Functions. The browser no longer uses a client-side `VITE_GEMINI_API_KEY`.
- Admin access is expected to come from Firebase custom claims.
- The image check is a food/not-food classifier. It does not estimate freshness or shelf life.
- Localization currently uses the Google Translate widget. There is no `VITE_GOOGLE_TRANSLATE_KEY` in the app.
- “Donate Money” is a pledge flow. Entries stay `pledged` until a real payment flow exists.

## Tech stack

- React 18 + Vite + TypeScript
- Firebase Auth, Firestore, Functions
- Tailwind CSS + Framer Motion
- React Leaflet / OpenStreetMap
- Vitest for unit tests

## Frontend setup

1. Install dependencies:

```bash
nvm use 20
npm install
```

2. Create `.env` in the project root:

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
VITE_GEMINI_TEXT_MODEL=gemini-1.5-flash
VITE_GEMINI_VISION_MODEL=gemini-1.5-flash
VITE_POLLINATIONS_KEY=optional_pollinations_key
VITE_USE_FIREBASE_EMULATORS=false
VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_AUTH_EMULATOR_PORT=9099
VITE_FIRESTORE_EMULATOR_PORT=8080
VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT=5001
```

3. Run the app:

```bash
npm run dev
```

## Functions setup

1. Install Functions dependencies:

```bash
npm --prefix functions install
```

2. Set the Gemini secret for Functions:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

3. Optional `functions/.env` for model names:

```bash
GEMINI_TEXT_MODEL=gemini-1.5-flash
GEMINI_VISION_MODEL=gemini-1.5-flash
```

4. Deploy rules + functions:

```bash
firebase deploy --only firestore:rules,functions,hosting
```

## Emulator setup

Use Node 20 locally so the Functions emulator matches the configured runtime:

```bash
nvm use 20
npm install
npm --prefix functions install
```

If your machine default Java is newer and the Firestore emulator is unstable, point the scripts at a Java 21 runtime:

```bash
$env:ONEMEAL_JAVA_HOME="C:\\path\\to\\jdk-21-or-jre-21"
```

Run the emulator-backed test suite:

```bash
npm run test
```

Inspect the emulators manually:

```bash
npm run emulators:start
```

Run the frontend against the local emulators by setting `VITE_USE_FIREBASE_EMULATORS=true` before `npm run dev`.

## Admin bootstrap

Grant the admin custom claim with Application Default Credentials or a service account:

```bash
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\service-account.json"
npm --prefix functions run set-admin -- admin@example.com
```

This script sets the Firebase Auth custom claim and syncs the Firestore `users/{uid}` profile.

## Optional legacy backfill

If you have pre-refactor production data, run the dry-run first:

```bash
npm --prefix functions run backfill:release
```

Apply it only after reviewing the planned changes:

```bash
npm --prefix functions run backfill:release -- --write
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:unit
npm run test:emulators
npm run check:functions
```

## Repo structure

- `src/` frontend app
- `functions/` Firebase callable backend
- `firestore.rules` authorization rules
