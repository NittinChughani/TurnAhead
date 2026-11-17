# TurnAhead v2.6.2 — deployment and verification

TurnAhead remains hosted on GitHub Pages and Firebase Firestore. No paid hosting or Cloud Function is required.

## Changes
- Removed the “I'm Here” arrival confirmation from patients and reception. Reception shows missed patients eligible for a one-time recall.
- Recalled tickets rejoin the end of their doctor's lane. The patient page follows the new waiting, called, and completed status; completed recalls are labeled “Recalled & completed” in patient, reception, and administrator views.
- Administration opens to the eight overview cards and profile photo; navigation opens staff, invitations, departments, doctors, patient tickets, attendance history, feedback, and settings in separate sections.
- Feedback remains one private, immutable response per completed ticket, owner-readable only. The updated rule avoids client-vs-server clock skew causing rejected submissions.
- Recall grace presets: 5, 10 (default), 15, 20, 30 minutes, plus a custom integer from 1–120 minutes.

## Important deployment steps
1. Review, test, and merge the v2.6.2 GitHub pull request into main; GitHub Pages deploys the web files.
2. **Separately publish the updated firestore.rules in the correct Firebase project's Firestore Database > Rules tab.** Merging GitHub code does NOT publish Firebase rules. Use the complete reviewed file and click Publish (or deploy with Firebase CLI).
3. Hard-refresh the patient QR tracking page, reception, and administrator dashboard.
4. Complete a sample ticket. Submit feedback from its private patient QR page, and confirm the owner sees it under the new Patient feedback section.
5. Skip a test ticket, recall it from Missed patients before grace expires, confirm the patient page becomes Recalled · Waiting, call it again and confirm Recalled · Your turn, then complete it and confirm Recalled & completed.
6. Save a custom grace value such as 7 minutes, refresh the admin page and confirm the value persists. Test admin navigation in desktop and mobile layouts.

## Privacy and limitations
- Patient links are private bearer QR URLs, not verified patient accounts.
- Feedback is immutable, constrained to a completed ticket and limited to ratings 1–5 and 300-character notes. Only the designated owner may read the documents.
- One feedback submission per ticket globally; an already existing document cannot be overwritten. If a first submission fails, retry within the dialog instead of dismissing it.
- Existing old arrival-request documents are left stored, but no client accesses them and the corresponding Firestore rules are removed.
- Automated unit and syntax tests do not prove deployed Firestore rules are current. Perform real-device, production-rule, and accessibility checks before a wider hospital pilot.
