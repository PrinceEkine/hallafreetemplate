# Tester guide (Ophixe release)

## Installing the test build

1. Open this link on your Android phone and download it (always the
   newest build, no account needed):
   https://github.com/PrinceEkine/halla/releases/download/release/ophixe-release.apk
   Uninstall any older Ophixe build first (required every time you
   update: each test build is signed with a fresh key), then install
   this one.
2. If prompted, allow **Install unknown apps** for your browser, then install.
3. Open **Ophixe** and sign up with a real email address (type the
   6-digit code from the confirmation email), then add your phone
   number when asked.
4. Use a physical device, not an emulator, if you want to test push
   notifications.

Your data is on a live test backend — anything you post is visible to other
testers in the same communities.

## What to test

- **Auth** — sign up, confirm the emailed 6-digit code, log in, log out, forgot-password code flow.
- **Phone step** — Nigerian formats (`0803...`, `+234803...`).
- **Communities** — create one, discover/join, member directory, roles.
- **Community switching** — open the sidebar (menu icon) and tap a
  community: Home, Update, Chat, Teams, and Event tabs all follow it.
  Back arrows in the community sections return to that community's page.
- **Feed** — text + picture posts, likes, comments.
- **Announcements** — post as admin, read the Updates tab.
- **Chat** — 1:1 and group chats, replies, reactions, read receipts.
  (the composer shows a lock whenever sending is end-to-end encrypted.)
- **Events** — create events, RSVP. Assigned tasks and private
  personal events appear here too.
- **Forms** — file a request; approve/reject one as admin; open admin
  form links.
- **Tasks & projects** — create, assign, track.
- **Media & files** — upload and open community media/files. Files need
  a folder first; media has photo/video/link filters.
- **Meeting** — open rooms, join linked chats (admins create rooms).
- **Communities** — pin up to 5, mark low priority, archive to profile;
  set a company logo at create or in edit.
- **Wallet** — view the community bank account and dues; pay by
  transfer, tap I've paid, and confirm as admin.
- **Profile** — tap the person icon (top right) to open it; name,
  avatar upload, phone edit, notification switches, archived
  communities. The round badge beside it opens your
  community's page. Real photos show in chat, directory, and feed.
- **Push** — with two accounts on two devices, send a chat message and
  confirm a notification arrives and opens the right screen.

## Reporting issues

For each bug, send:

1. What you did (step by step) and what you expected.
2. What happened instead (screenshot or screen recording helps).
3. Your phone model + Android version, and roughly when it happened.

## Known limitations in this build

- Phone numbers are saved, not SMS-verified.
- Group chats are end-to-end encrypted; members who have never opened the
  app have no keys yet and see a placeholder until a later message includes
  them.
- Google sign-in may be unavailable if the provider isn't enabled.
