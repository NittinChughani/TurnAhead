# TurnAhead v3.0 analytics + v3.1 hospital customization

This combined 3.1.0 release candidate builds on deployed v2.6.3. The admin Overview remains unchanged; the new functions live in Analytics, Customization, and Setup guide.

## v3.0 — Advanced analytics
- Generate on-demand, owner-only aggregate reports for one day, trailing 7 days, or trailing 30 days ending on a chosen date (Pakistan time).
- Read date-indexed department history with pagination rather than the recent live-ticket list. Feedback is read by submission date, with no comment or patient name retained in the report. A report is explicitly rejected if it exceeds 10,000 records or 500 queries; choose a shorter date range. Firestore reads count against existing quotas.
- Show ticket volume by date and hour, completed/final missed/unresolved/recalled/recalled-completed counts, mean waiting and service times with sample counts, per-doctor and per-department totals, and patient satisfaction ratings and trends.
- Wait means issue-to-call; recalled tickets are excluded from that mean because the existing model overwrites the initial call timestamp. Service means call-to-completion; records with missing or invalid timestamps do not contribute. Final missed and recalled are distinct, overlapping categories. Historical archives are not backfilled. Reports are assembled from multiple reads, not a transactional snapshot, and can change while today's queues are active.
- Export aggregate CSV and landscape PDF locally, without patient names, QR IDs, or feedback comments. CSV escapes formula-like labels. The PDF uses the existing jsPDF CDN and standard fonts; non-Latin labels require font verification.

## v3.1 — Hospital customization
- Upload/remove an optional hospital logo (PNG/JPEG/WebP, aspect ratio preserved, compressed client-side). The original TurnAhead logo remains unchanged.
- Set accent color, optional daily opening/closing times (Pakistan time, supports overnight hours), 1–12 reception counters, a printed ticket note, public-board standard/large layout, and a public message.
- Branding is displayed in admin, reception, patient tracking, printed tickets and the board. Staff and board watch hospital updates in real time; patient branding loads when the page opens. Changes to printed paper cannot affect already-printed tickets.
- Hours are displayed as information, not an automatic closure or restriction on care. Counter limits apply to current reception UI and actions; active tickets on counters outside a newly reduced range can still be finished. This is an operational setting, not a new staff authorization boundary.
- The setup guide shows actual setup progress for the operator-provisioned hospital, departments, doctors, staff, hours and logo. Public self-provisioning is intentionally not enabled.
- Settings contain only public hospital information; don't upload patient, staff, or clinical data. The existing hospital document is publicly readable by hospital ID. Rules restrict updates to the existing verified owner and validate every customization field. Existing documents without customization retain the old defaults.

## Rollout — required
1. Test the updated rules in a Firebase Emulator or dedicated staging project, including owner, non-owner, invalid values and cross-hospital writes. The repository's unit/static tests alone do not establish Firestore authorization.
2. Publish the complete release-branch firestore.rules to the correct Firebase project. These rules are backward-compatible with hospital documents without customization; the old frontend can continue functioning.
3. Merge the reviewed pull request and confirm the GitHub Pages workflow succeeds. The website itself does not publish Firestore rules. No paid service is introduced.
4. Hard-refresh. In a test hospital, verify daily/7/30-day reports against known fictional records; check counts, date boundaries, averages, CSV/PDF, empty results and export denial after logout. Test slow and failed queries.
5. Save and reload each customization setting as the owner. Verify that ordinary staff cannot change settings. Test both themes, mobile layout, printed ticket, public board and patient page. Reduce counters while a fictional patient is active on a high-numbered counter, then finish the visit without starting another visit there.
6. Retest v2.6.3 feedback, recall, staff access and board announcements. Keep patient data out of test records and complete privacy/security validation before real hospital use.

The release adds application features, not production certification. Live Firebase deployment, emulator authorization tests, browser/printing validation and load testing remain separate acceptance gates.
