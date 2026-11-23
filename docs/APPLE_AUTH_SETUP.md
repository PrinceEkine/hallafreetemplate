# Sign in with Apple setup

The app code is done (native Apple button on login + signup, iOS only).
Three owner-side steps remain before it works in a build.

## 1. Apple Developer (https://developer.apple.com)

1. **Identifiers → App IDs → `com.ophixe.app** → enable the
   **Sign in with Apple** capability → Save.
2. **Keys → +** → name it `Ophixe Apple Login` → check
   **Sign in with Apple** → Configure → pick the `com.ophixe.app`
   primary App ID → Save → Continue → Register.
   - Download the `.p8` file (one chance — keep it safe).
   - Note the **Key ID** (shown on the key row).
3. Note the **Team ID** (Membership page, top-left).
4. **Identifiers → Services IDs → +** → e.g. `com.ophixe.app.signin` →
   check **Sign in with Apple** → Configure:
   - Primary App ID: `com.ophixe.app`
   - Return URLs: `https://eatxkfopyljdomzbhzym.supabase.co/auth/v1/callback`

## 2. Supabase dashboard → Authentication → Sign In / Providers → Apple

Enable it and fill in:

- **Client IDs** (comma-separated): `com.ophixe.app, com.ophixe.app.signin`
- **Team ID**, **Key ID**: from step 1.
- **Private key**: paste the full `.p8` contents (including the
  `-----BEGIN PRIVATE KEY-----` lines).

Save. No app code or migration changes needed for this step.

## 3. Rebuild the iOS app

The `expo-apple-authentication` plugin in `app.json` adds the
Sign-in-with-Apple entitlement at build time, so any existing
TestFlight/App Store build predates it:

```sh
eas build -p ios --profile preview
```

Install that build on a real iPhone (simulator works too if it is
signed into iCloud) and use the black **Sign in with Apple** button
on the login or signup screen.

## Notes

- Android and web never show the button (`isAvailableAsync` gate).
- Apple shares the user's name only on the very first sign-in; the
  app saves it to the profile then and never asks again.
- If Apple is tapped before step 2 is done, the app says plainly
  that Apple sign-in is not set up yet instead of failing silently.
