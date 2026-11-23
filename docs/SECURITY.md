# Security notes (Ophixe)

How this app is protected against reverse engineering and data theft,
and what is intentionally left to backend enforcement.

## Honest baseline

No shipped mobile app can be made impossible to reverse engineer. Anyone
with the APK/IPA can unzip it and inspect it. The strategy here is to make
client code hard to read and useless to steal from: there are no secrets
in the bundle, and every sensitive decision is enforced by Supabase
(RLS policies, storage policies, security-definer RPCs), not by the UI.

## What is already in place

- **Release builds only for testers and production.** EAS `preview` and
  `production` profiles ship Hermes bytecode + minified JS, not readable
  source. Dex bytecode and Hermes bundles can be decompiled only with
  significant effort, and contain no keys beyond the public anon key.
- **No secrets in the bundle.** The only bundled credential is
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, which is public by design. Real
  authority lives in RLS/storage policies and the `FANOUT_SECRET`
  server secret (never in the repo; `.env` is
  gitignored and EAS holds the build-time values).
- **No `console.*` calls in app code.** Nothing sensitive is printed at
  runtime; `tests/check-phase1.mjs` fails the build if one is added.
- **Tokens and keys in secure storage.** On native, Supabase sessions
  persist in a chunked SecureStore adapter (`lib/secureStorage.ts`;
  sessions saved by older builds migrate over on first launch, then the
  plaintext copy is deleted). E2EE private keys live only in SecureStore
  on native (memory-only on web, where there is no secure enclave).
  Message plaintext for DMs and groups never touches the server (NaCl
  box, see `supabase/README.md`).
- **Reads stay inside the community.** Events and RSVP lists are visible
  to community members only (migration `2026112101`); push tokens live
  in an owner-only table, not on profiles (migration `2026112102`).
- **Android backup disabled** (`allowBackup: false` in `app.json`), so
  app data cannot be lifted via `adb backup`.
- **Deep-link scheme is app-specific** (`ophixe://`), and OAuth uses the
  system browser session with `maybeCompleteAuthSession()`.

## Deliberately not done (and why)

- **E2EE storage keys were not renamed** in the Halla → Ophixe rebrand.
  Renaming them would orphan existing testers' private keys and lock
  them out of old messages. They are invisible identifiers, not branding.
- **No JavaScript obfuscator plugin.** Hermes + minification is the
  supported Expo path; third-party obfuscators routinely break
  React Native bundles and add little once secrets live server-side.
- **No root/jailbreak detection or certificate pinning.** Both add
  support burden and false positives for a staff/community app whose
  data is already gated per-member by RLS. Revisit if a threat review
  says otherwise.

## If you need stronger Android hardening later

1. Add `expo-build-properties` and enable R8 resource shrinking for
   release builds.
2. Turn on Play App Signing + Play Integrity API checks for API abuse.
3. Keep source maps out of the shipped artifact (EAS does this by
   default; never upload them to a public Sentry project without
   scrubbing).

## Backend checklist (Supabase dashboard)

- RLS stays enabled on every table (migrations enforce this; verify in
  Table Editor > any table > RLS badge).
- Storage: `avatars` + `post-media` public; `evidence`,
  `community-media`, `community-files` private. Never flip a private
  bucket to public to "fix" a broken image — fix the policy instead.
- Rotate `FANOUT_SECRET` if it leaks; the app needs no update
  (see `docs/BACKEND.md`).
