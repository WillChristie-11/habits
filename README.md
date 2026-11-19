# Habits

A personal, local-only habit tracker for iPhone (Expo / React Native, Expo SDK 58).

## Run it on your iPhone (Expo Go)

1. Install **Expo Go** from the App Store (it must support SDK 58).
2. On your computer (Node 20+), in this folder:

   ```bash
   npm install
   npx expo start
   ```

3. Scan the QR code with the iPhone Camera app. Phone and computer need to be on the
   same Wi‑Fi; if they can't see each other, use `npx expo start --tunnel`.

## Develop

```bash
npm test          # scheduling / progress logic tests
npm run typecheck
npx expo lint
```

## Layout

- `src/types.ts` – habit + record model
- `src/db/db.ts` – SQLite schema (versioned with `PRAGMA user_version`) and queries
- `src/lib/schedule.ts` – pure logic: day states, weekly %, due/overdue, "never miss twice", stacking order
- `src/store.tsx` – app state (React context over SQLite)
- `src/screens`, `src/components` – UI
