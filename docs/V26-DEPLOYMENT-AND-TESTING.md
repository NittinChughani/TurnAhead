# TurnAhead v2.6 — rollout checklist (development candidate)

Six new capabilities use the existing GitHub Pages and Firebase Firestore architecture. **No Firebase Functions, SMS, web push, payment API, Cloud Storage, or billing is required for v2.6**. Firestore Spark quotas still apply. All new patient QR links are bearer secrets.

## Features

1. **In-page near-turn alerts** appear at 3 people, 1 person and called, using only the live Firestore queue listener. One popup per stage per browser tab session; no notification permission. On returning from background, live status is rechecked. Does **not** create Android/iOS notification shade or lock-screen messages.
2. **Missed-turn recall** can be used once per missed ticket by authorized reception staff within an administrator-configured 5–30-minute grace period (10 by default). An atomic transaction returns the ticket to the **end of the same doctor's line**. A currently served patient is never displaced. The staff panel lists recent eligible tickets, not the whole historical archive.
3. **I'm Here** creates one pending arrival request from a ticket's bearer URL. Reception must verify the patient in person. It has no effect on queue order, patient attendance, or priority.
4. **English/Urdu** language controls with right-to-left support for translated patient status, alerts, feedback/arrival and core public-board/staff feature labels. Some older administrative and reception copy remains English in this development candidate; a full localization pass is still needed before describing the complete interfaces as bilingual.
5. **Public-board voice** is opt-in using browser speech synthesis after a user click. It announces new tickets and counters (not patient names), depending on available voices, device audio, and foreground browser availability. No audio guarantee on all devices.
6. **Patient feedback** is a private, immutable, one-time rating with up to 300 characters per completed ticket, within 24 hours. Only authorized hospital owner can view ratings or notes. No medical details should be entered. An administrator must moderate/establish a retention policy before public hospital piloting.

## Deployment order — do not skip

1. Back up current `firestore.rules` and database. Use **Firebase Emulator Suite** tests for signed-out/owner/receptionist/cross-hospital access, including invalid arrival/feedback writes, attempts to update public feedback, and recall-after-grace abuse. **These emulator tests have not yet been run.**
2. Publish the reviewed v2.6 `firestore.rules` first from Firebase Console (Firestore Database → Rules), compare the exact rule text and publish. Do **not** edit billing plan or deploy the optional Cloud Functions.
3. Merge the v2.6 GitHub PR only when tests pass. Wait for GitHub Pages to publish, hard refresh patient/desk/board pages to avoid stale browser caches. The public website remains unchanged until merge.
4. Run real Firebase integration smoke tests with fictional tickets: issue/call/skip/recall, two counters simultaneously, arrival request → staff confirmation, feedback one-time submission → owner dashboard, English/Urdu switch, voice sound enabled, Android popup behavior, Safari/iOS layout.
5. Monitor Firestore reads/writes and browser console for errors. Investigate any permission-denied reports; do not weaken rules as a workaround.

## Important security and product limits

- Patient QR URLs are unguessable bearer tokens, **not** authenticated patient accounts. Possession of the private URL allows viewing status, requesting arrival once and providing one feedback response after completion. Do not print/share them publicly.
- Verification is a **staff acknowledgement**, not automated GPS/device proof or identity verification.
- Public feedback writes are constrained in Firestore rules to the completed ticket and 24-hour window; comments are owner-readable only. There is no automated spam moderation, retention expiry, or abuse prevention beyond unguessable link IDs and one immutable record per ticket.
- Reception missed/arrival panels use bounded recent queries and may not surface every ticket from a very busy day. Do not treat the recent list as the complete archive.
- A disconnected/suspended browser cannot show an in-page near-turn alert until the tracking page resumes and connects.
- App languages translate interface content, not patient names or hospital-entered department/doctor strings. Urdu voice depends on the device's installed text-to-speech voices; the fallback may pronounce Urdu poorly.
- **Lock-screen notifications are not implemented** on the free Spark deployment. The optional push scaffold stays disabled.
