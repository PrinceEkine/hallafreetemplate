# Chat Plus: calls, media, wallpaper, notifications — setup guide

Everything in this release is implemented client-side. Three server-side
steps are needed before calls and background notifications work on real
phones. Media, edit/delete, replies, wallpapers, admin tags, and the quick
nav work as soon as the migrations below are applied.

## 1. Database migrations (required for everything)

Apply in the Supabase SQL editor, in order:

- `supabase/migrations/2026111701_chat_plus.sql` — message `edited_at` /
  `deleted_at`, unseen-edit guard, group-edit RPC, `chat-media` bucket.
- `supabase/migrations/2026111702_form_types.sql` — `exit_request` →
  `leave_request`, `relocation` → `staff_report` (existing rows migrated).

Then enable realtime for the new event types (already covered if the
`messages` table is in the `supabase_realtime` publication — UPDATE events
flow on the same publication; no extra step needed).

## 2. Voice/video calls (Agora)

Calls use Agora RTC with tokens minted by the existing `agora-token` edge
function. The app's `call_signals` rows fan out incoming-call pushes via the
existing `push-fanout` function.

1. Create an Agora project at console.agora.io and copy the App ID and App
   Certificate.
2. Set edge-function secrets:
   `supabase secrets set AGORA_APP_ID=... AGORA_APP_CERTIFICATE=...`
3. Deploy (or redeploy): `supabase functions deploy agora-token`.
4. Build a native app: calls need `react-native-agora`, which only loads in
   EAS dev/production builds or the CI release APK — under Expo Go the call
   screen says so instead of crashing.

Pricing (Agora list, per 1,000 participant-minutes, 2026): audio $0.99, HD
video $3.99, Full HD $8.99. The first 10,000 minutes/month are free.
Screen sharing is billed as video at the published resolution tier.

Screen sharing works on Android out of the box. iOS needs a ReplayKit
broadcast extension, which Expo managed builds cannot ship — on iOS the app
explains this when Share is tapped.

## 3. Notifications that pop when the app is closed

Push delivery when closed comes from the OS (FCM on Android, APNs on iOS),
fed by the existing `push-fanout` edge function and DB triggers.

- Android: upload your FCM server key / service-account JSON in the Expo
  dashboard (Project > Credentials), then build with EAS or CI. The app
  registers its Expo push token on every sign-in AND every warm start.
- iOS: attach the APNs key in the Expo dashboard and build with EAS.
- The app shows a banner + sound + badge even while open
  (`configureNotifications` in `lib/push.ts`), and tapping a chat
  notification deep-links to the thread (call pushes land on the thread,
  where the JOIN banner is waiting).

Without store/EAS credentials, pushes still work in EAS dev builds on a
physical device signed into the same Expo account.

## 4. Offline behavior (already on-device)

- Threads cache encrypted rows + already-opened plaintext + DM/group keys,
  so a thread opened offline reads instantly after the first visit.
- Attachments decrypt into the app document folder and stay available
  offline after the first open.
- Startup routes from cached data first and refreshes in the background;
  every tab screen renders its saved copy with no network.
- Text sends queue in the outbox and flush on reconnect. Attachment
  uploads need the network and say so.

## iOS notes

Same codebase, same features. Permission strings are configured in
`app.json` (camera, microphone, photo library). The only iOS gap is screen
sharing (see above).
