# TurnAhead v2.6 — rollout checklist (v2.6.1 refinements)

Six new capabilities use the existing GitHub Pages and Firebase Firestore architecture. **No Firebase Functions, SMS, web push, payment API, Cloud Storage, or billing is required for v2.6**. Firestore Spark quotas still apply. All new patient QR links are bearer secrets.

## Features

1. **In-page near-turn alerts** appear at 3 people, 1 person and called, using only the live Firestore queue listener. One popup per stage per browser tab session; no notification permission. On returning from background, live status is rechecked. Does **not** create Android/iOS notification shade or lock-screen messages.
2. **Missed-turn recall** can be used once per missed ticket by authorized reception staff within an administrator-configured 5–30-minute grace period (10 by default). An atomic transaction returns the ticket to the **end of the same doctor's line**. A currently served patient is never displaced. The staff panel lists recent eligible tickets, not the whole historical archive.
3. **I'm Here** is prominently displayed immediately below the patient heading. It creates one pending arrival request from a ticket's bearer URL. Reception must verify the patient in person. It has no effect on queue order, patient attendance, or priority.
4. **English-only** UI. The incomplete English/Urdu switch and RTL mirroring have been removed from patient, reception, board and admin pages. Full bilingual support is postponed until translation coverage and RTL QA are complete.
5. **Public-board voice** is opt-in using browser speech synthesis after a user click. It announces newly called tickets and counters (not patient names). Calls received while the board is hidden are queued briefly and spoken when the board becomes visible, rather than silently discarded. For reliable immediate announcements, keep the board open on a dedicated visible display. Actual audio availability varies by browser and device.
6. **Patient feedback** appears as a one-time modal as soon as a completed ticket is viewed in the foreground. Dismissal or submission prevents repeated prompts on the same device. Submission remains a private, immutable, one-time rating with up to 300 characters per completed ticket, within 24 hours. Only the hospital owner can view ratings or notes. No medical details should be entered; a retention policy is needed before broad piloting.

## Deployment notes — v2.6.1 patch

1. This patch changes only patient/board UI, English localization, voice handling, tests and documentation. **No new Firestore rules are required for v2.6.1.** Do not overwrite or weaken published security rules for this patch.
2. Run `npm test` and `npm run check` and review the pull request. Test on Android, desktop Chrome and iOS Safari if devices are available, especially the voice button and a receptionist calling while the board is in a different tab.
3. Merge the reviewed patch into `main`; verify GitHub Pages deployment and hard-refresh the tracking, board and desk pages. Inactive/stale service workers or cached scripts can delay a visible change.
4. Confirm the “I'm Here” banner is visible before queue details, transitions to pending/verified when reception acts, and does not change queue order. Confirm the completion feedback appears only once per ticket per browser/device and dismissing it hides it permanently on that device.
5. Enable voice on the public board while visible. Call a new ticket from another staff browser. If testing by switching tabs on one device, return to the board within two minutes; the queued call should play. Audio must be enabled in the device and browser.
6. Existing v2.6 security validation remains important: **Firebase Emulator role and cross-hospital rules tests have not been completed**, and real deployment security/integration checks must be run before wider piloting.

## Important security and product limits

- Patient QR URLs are unguessable bearer tokens, **not** authenticated patient accounts. Possession of the private URL allows viewing status, requesting arrival once and providing one feedback response after completion. Do not print/share them publicly.
- Verification is a **staff acknowledgement**, not automated GPS/device proof or identity verification.
- Public feedback writes are constrained in Firestore rules to the completed ticket and 24-hour window; comments are owner-readable only. There is no automated spam moderation, retention expiry, or abuse prevention beyond unguessable link IDs and one immutable record per ticket.
- Reception missed/arrival panels use bounded recent queries and may not surface every ticket from a very busy day. Do not treat the recent list as the complete archive.
- A disconnected/suspended browser cannot show an in-page near-turn alert until the tracking page resumes and connects.
- English-only for now. Full Urdu translation and accurate RTL layout are deferred; hospital-entered patient and doctor names remain unchanged.
- **Lock-screen notifications are not implemented** on the free Spark deployment. The optional push scaffold stays disabled.
