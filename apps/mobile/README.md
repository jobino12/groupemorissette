# @gm/mobile — Field technician app (Expo)

React Native app for field technicians. Built with Expo Router.

## Phase 1 scope

- Login (PIN after first auth)
- Today (jobs for the signed-in tech)
- Work order detail (customer, site, parts, notes)
- Status actions (En route, On site, Paused, Done)
- Capture photo (expo-camera)
- Capture signature
- Log time + parts used
- Offline outbox (expo-sqlite) — see `src/sync/outbox.ts`

## Setup

```bash
pnpm install
pnpm --filter @gm/mobile start
```

Then press `i` for iOS simulator or `a` for Android emulator.

## Sync strategy

Every mutation writes locally first to a SQLite `outbox` table and a
foreground sync loop POSTs to the tRPC API when online. Append-only events
(photos, signatures, time entries, status changes) are conflict-free.
Scalar field edits use server-side last-write-wins.

EAS Update is used for OTA JS bumps so we don't need to rebuild the app
for most changes.
