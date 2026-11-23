# Ophixe backend

## Apply the migration

```sh
supabase link --project-ref <your-ref>
supabase db push
```

Or paste `migrations/2026110801_community_modules.sql` into the dashboard
SQL editor. It is idempotent and safe to re-run.

What it creates:

- Tables: `community_tasks`, `community_projects`, `community_media`,
  `community_files`, `event_rsvps`
- Columns: `profiles.public_key` + `avatar_url`, `posts.image_url`,
  `announcements.image_url`, `communities.settings`,
  `conversations.community_id`, `events.community_id` + `created_by`
- Indexes on every hot list path (chat history, feeds, members, submissions)
- RLS: members read their community, admins write, owners delete their uploads
- Buckets: `avatars` + `post-media` (public, CDN-friendly),
  `community-media` + `community-files` (private, signed URLs)

The app also runs before this migration: every new screen detects missing
tables and shows a setup hint instead of crashing.

## Security notes

- DMs and group chats are end-to-end encrypted (X25519 + XSalsa20-Poly1305,
  NaCl box). DM ciphertext travels in `messages.body` as a `{"v":1,"n","c"}`
  envelope; group sends additionally fan out one sealed envelope per member
  into `message_envelopes`, so the server never sees new group plaintext.
  Private keys never leave the device (SecureStore, AsyncStorage fallback).
  Sender keys remain the future optimization for very large groups; the
  composer shows a closed lock whenever sending is encrypted.
- Signed URLs expire (15 min default). RLS confines reads to active members.
- Never log message bodies, keys, or tokens.

## Scaling to 10M users

App + schema already ship the foundations: keyset-friendly ordering with
`limit`/`range` paging on chat, directory, tasks, media and files,
virtualized lists, short signed URLs, and per-community indexes.

Beyond that, 10M needs infrastructure, not just code:

1. Supabase Scale/Enterprise with Supavisor pooling (serverless-safe).
2. Read replicas for feed/member hot paths; move counts to materialized views.
3. Storage CDN in front of `avatars` and `post-media`.
4. Push fan-out via edge functions + FCM/APNs (never from clients).
5. Realtime: one channel per conversation (already scoped); add presence caps.
6. Partition `messages` by month once it passes ~100M rows.
7. Rate-limit uploads and inserts with a quotas table + edge checks.

## Push setup (steps 2 and 3)

```powershell
supabase login
./scripts/setup-backend.ps1
```

The script links the project, pushes migrations (which seed the function URL
into the locked-down `app_settings` table), generates a `FANOUT_SECRET`, and
deploys `push-fanout`. It then prints one `update app_settings ...` line to
paste into the dashboard SQL Editor for the secret. Triggers stay silent
until both values exist, so this is safe to run at any time.
