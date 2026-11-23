# Push credentials setup (Ophixe)

Closed-app push (messages, calls, mentions on a sleeping phone) needs
platform credentials. Foreground banners already work without them;
nothing arrives while the app is closed until this is done. Free.

## Android (FCM)

1. Open the [Firebase console](https://console.firebase.google.com),
   create a project (or reuse one), and add an Android app with package
   `com.ophixe.app`.
2. Download `google-services.json` and put it at the repo root (next to
   `app.json`). Reference it in `app.json` under
   `expo.android.googleServicesFile` if EAS asks for it.
3. In Firebase: Project settings > Service accounts > Generate new
   private key. This JSON is the FCM V1 credential.
4. In the [Expo dashboard](https://expo.dev): your project > Credentials
   > Android > "FCM V1 service account" > upload that JSON.
5. Rebuild (`eas build -p android --profile preview`) and reinstall —
   push credentials bake into the build.

## iOS (APNs, when iOS ships)

1. In the Apple Developer portal: Certificates, Identifiers & Profiles >
   Keys > create a key with Apple Push Notifications service enabled.
   Download the `.p8`, note the Key ID and Team ID.
2. In the Expo dashboard: your project > Credentials > iOS > push key >
   upload the `.p8` with its Key ID and Team ID.
3. Rebuild for iOS.

## Verify

1. Install the fresh build, sign in, and force-close the app.
2. From a second account, send a chat message: a push should pop with
   the sender's name and the message text.
3. Start a voice call from the second account: a high-priority call
   push should pop (tap it to join).
4. Reply from the notification shade (Reply button): the message should
   land in the thread.

## Troubleshooting

- Nothing arrives closed but banners work open: the build predates the
  credentials — rebuild and reinstall, then sign in again (tokens
  register on warm start).
- `ExponentPushToken` missing server-side: open the app once while
  signed in; registration is best-effort and silent on failure.
- Stale call pushes after offline stretches: calls carry a 60s TTL, so
  the network drops them instead of ringing late.
