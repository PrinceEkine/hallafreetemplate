# Ophixe

Community app for companies and staff: announcements, chats, posts, events,
forms, tasks/projects, media, and wallet dues. Built with Expo (React Native)
and Supabase.

## Quickstart

```powershell
npm install
Copy-Item .env.example .env   # then fill in your Supabase URL + anon key
npx expo start                # or: npm run android
```

```powershell
npm test   # route, module, session, screen, and chat-depth guards
```

## Backend (Supabase)

Project: `Ophixe` (`eatxkfopyljdomzbhzym`).

```powershell
npm install -g supabase
supabase login
./scripts/setup-backend.ps1
```

The script links the project, pushes all migrations, sets `FANOUT_SECRET`,
deploys the `push-fanout` edge function, and prints one SQL line to paste into
the dashboard SQL Editor (stores the fan-out secret in `app_settings`).
Full runbook: [docs/BACKEND.md](docs/BACKEND.md).

## Tester builds (EAS)

```powershell
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

Cloud builds do not read your local `.env`. The required vars
(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) must exist in
EAS for the `preview` environment — check with `eas env:list preview`.
What to send testers: [docs/TESTERS.md](docs/TESTERS.md).

## Project layout

- `app/` — expo-router screens (`(auth)`, `(tabs)`, `chat`, `community`,
  `event`, `forms`, `post`, `profile`, `wallet`)
- `components/`, `constants/`, `lib/` — UI, theme, Supabase/data helpers
- `supabase/migrations/` — database schema (applied in filename order)
- `supabase/functions/` — `push-fanout` (push notifications)
- `supabase/email-templates/` — branded Auth emails + install notes
- `scripts/setup-backend.ps1` — one-shot backend setup
- `tests/` — `npm test` guards (dead links, modules, screens, chat depth)

## Not wired up yet

- Outgoing email is Supabase's default sender; Resend SMTP comes later
  (Auth > Emails > SMTP Settings, no code changes needed).
- Dues are paid by bank transfer to the community account (set by admins
  in community edit); members tap I've paid and admins confirm. There is
  no card funding.
- Google sign-in needs the Google provider enabled in Supabase Auth.
- Phone screen saves the number only; SMS verification is coming soon.
- Crash reporting is dormant: `@sentry/react-native` stays in the code with
  no DSN, and its Expo plugin is intentionally not installed until a Sentry
  organization/project and auth token exist (the plugin fails Android
  builds without them).
