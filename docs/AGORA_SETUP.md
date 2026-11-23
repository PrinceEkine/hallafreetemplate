# Agora voice/video setup for Ophixe

Calls and meeting rooms run on Agora RTC. The app itself needs **no Agora
keys**: when you join a call, the `agora-token` edge function mints a
short-lived token after checking you belong to that chat or community.
You only need to (1) create the Agora project, (2) give its two secrets
to Supabase, and (3) run the app as a native build. Without step 2,
calls show "Calling is not configured yet" instead of connecting.

Status when this guide was written: `agora-token` is deployed and ACTIVE,
but `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` are **not set yet**.

## 1. Create the Agora project

1. Sign up at [console.agora.io](https://console.agora.io) and create a
   project (any name, e.g. "Ophixe").
2. On the project page, under **App ID**, copy the App ID.
3. Under **App Certificate**, click to enable/show the **Primary
   Certificate** and copy it. (Tokens cannot be minted without it.)
4. Agora has a free starter allowance — check current pricing/limits in
   the console under Usage. Nothing in Ophixe records or stores call
   audio/video; Agora only relays the live media.

## 2. Give the secrets to Supabase

From this repo (Supabase CLI, already linked to Halla):

```powershell
supabase secrets set --remote AGORA_APP_ID=paste_app_id_here AGORA_APP_CERTIFICATE=paste_certificate_here
supabase secrets list --remote
```

(The list shows names only, never values.) Dashboard alternative:
Supabase Dashboard → Edge Functions → Secrets → add both names.

No app rebuild or redeploy is needed afterwards — the live
`agora-token` function reads the secrets on every call. If you ever
rotate the certificate, just set the secret again.

## 3. Run calls on a native build (not Expo Go)

`react-native-agora` is a native module, so calls only work in EAS
development, preview, or production builds. Under Expo Go the call
screen says so instead of crashing.

```powershell
npm install -g eas-cli
eas login
eas build --profile development --platform android   # daily testing
eas build --profile preview --platform android       # tester APK
```

`eas.json` profiles and the EAS project id are already configured.
Android declares microphone/camera via the `expo-audio` / `expo-camera`
config plugins; iOS usage strings come from the same plugins. The app
asks for microphone (every call) and camera (video calls) at join time,
plus notifications so incoming calls can ring (see `lib/permissions.ts`).

## 4. Test

1. Install the build on two devices, sign in as two staff in one
   community.
2. Start a 1-1 call from a chat: accept the mic/camera prompts, confirm
   both sides connect (starter sees Calling, joiner Ringing).
3. As an admin, create a meeting room, invite the other member, press
   OPEN: the invitee should get the incoming-call popup anywhere in the
   app, and JOIN should land both in the room.
4. END closes the room for everyone; leaving alone does not.

Watch the token function while testing: Dashboard → Edge Functions →
`agora-token` → Logs.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| "Calling is not configured yet" | Secrets missing → step 2 above. |
| "needs the native app build" screen | Running under Expo Go → step 3. |
| App closed on join (old builds) | Missing runtime permission → update to a build with the `lib/permissions.ts` gate. |
| "You are not in this chat" / "Join the community first" | Token function enforcing membership → join first. |
| No audio, connects fine | Mic denied or speaker routing → allow the mic in system settings, use the Speaker toggle. |
| Screen share missing on iOS | Expected: iOS needs a ReplayKit broadcast extension (Android only for now). |

## Files

- Token minting + membership checks:
  [agora-token](C:\Users\DELL\Desktop\Projects\Skywave\supabase\functions\agora-token\index.ts)
- App side (token fetch, signals, room entry):
  [lib/calls.ts](C:\Users\DELL\Desktop\Projects\Skywave\lib\calls.ts),
  [call screen](C:\Users\DELL\Desktop\Projects\Skywave\app\call\[id].tsx),
  [meetings page](C:\Users\DELL\Desktop\Projects\Skywave\app\community\actions.tsx)
- Permission gate: [lib/permissions.ts](C:\Users\DELL\Desktop\Projects\Skywave\lib\permissions.ts)
