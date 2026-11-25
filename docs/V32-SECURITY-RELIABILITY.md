# TurnAhead v3.2 — Security, reliability and privacy operations

This release improves the existing v3.1.0 web app. It does not introduce a paid service, change Firestore permissions, or make TurnAhead a certified hospital product.

## Security validation
- The new Firestore security emulator workflow runs against the isolated `demo-turnahead` project, never the live Firebase project. It tests owner/staff/disabled/unverified/anonymous roles, cross-hospital private data isolation, hospital branding validation, feedback immutability, and two simultaneous counters competing for one FIFO ticket.
- Run `npm install --no-save --package-lock=false firebase@11.10.0 @firebase/rules-unit-testing@4.0.1 firebase-tools@14.12.0`, install Java 21, then `npm run test:rules`. The normal `npm test` remains dependency-free.
- Client-side staff membership lookup now requires a server response. Admin verifies the designated owner UID, responds to membership revocation, cancels stale archive/export results, and clears private lists on sign-out. Reception clears patient receipts and lists when switching hospitals or signing out.
- Private QR, invitation and workspace pages use no-referrer and noindex metadata. These are defense-in-depth, not access-control substitutes: the QR is still a bearer link, and the owner remains responsible for protecting it. Firebase's public hospital/queue reads are intentional; do not enter clinical data.
- The unchanged legacy v2.0 staff rule expires on December 12, 2026. Verify no old clients depend on it before removing that legacy branch. Do not extend it casually.

## Network and accessibility
- Reception has a persistent connection indicator; queue actions require server-confirmed snapshots and an online connection. One shared operation guard prevents repeated issue/call/complete/skip/recall operations during re-render. No automatic retry of a potentially committed write is introduced. A failed connection is not proof of a failed write: check the live ticket state before retrying.
- Counter settings are read inside issuance and call transactions; a reduced counter limit does not block finishing existing patients. This is not a new authorization boundary enforced against arbitrary custom clients.
- Public board labels cached or offline data and does not announce calls from unconfirmed snapshots. Patient tracking distinguishes cache misses from confirmed deletion and clears private ticket fields after a confirmed miss. Storage restrictions do not turn successful feedback into errors.
- Bounded queue maintenance concurrency, date-report cancellation checks, visible keyboard focus, live status announcements and reduced-motion support. Unit tests exercise the 2,000-ticket queue capacity; this is not a hosted load benchmark.

## Retention: operator-only, dry run by default
The repository includes `scripts/retention.mjs`, not deployed to GitHub Pages. The operator must establish a lawful retention policy with the responsible hospital, verify a recoverable backup, use authorized local Application Default Credentials, and test in a synthetic staging project first. No retention period is imposed on hospitals automatically. Never upload credentials or exported patient records to GitHub, ChatGPT or public storage.

Install the Firebase Admin SDK locally using `npm install --no-save --package-lock=false firebase-admin`. Run `npm run retention -- --project PROJECT --hospital HOSPITAL_ID --days APPROVED_DAYS` for a **read-only dry run**. The output contains counts only. The scan is bounded to 100 tickets by default (1–500 via --limit); it is not a full data inventory. Only matching completed/skipped ticket and archive pairs older than the explicitly selected cutoff (30–3650 days) are eligible. Records linked to an active/pending control, recent feedback, missing or inconsistent archive/control, or a queue still on that day are skipped. Older unresolved and legacy records need separate authorized review. A scan dominated by ineligible records can require further operator review, not repeated blind runs.

Deletion is explicitly opt-in for an authorized operator after review. It requires the flags --apply, --backup-confirmed, and --confirm PROJECT/HOSPITAL_ID. Each deletion rechecks the relevant records in a transaction and deletes the QR ticket, matching private history record, and eligible linked feedback together. It does not touch staff, doctors, settings, live queues, or date index markers. Deletion is permanent without a backup; analytics totals will reflect remaining records and printed QR links will stop resolving. There is no scheduled automatic deletion, and backups and exported PDFs require their own retention policies.

## Backup and recovery procedure
1. Assign a hospital/operator owner and backup custodian; document data inventory, retention, recovery point and recovery time objectives.
2. Use Google Cloud's managed Firestore export/backup facilities in an organization-controlled, access-restricted project/bucket. Managed export/import may require billing and incurs storage/operation costs. Do not enable billing automatically. Follow current official documentation: https://firebase.google.com/docs/firestore/manage-data/export-import and https://cloud.google.com/firestore/docs/backups.
3. Record the backup timestamp, project, database and authorized location in a private operations log. Test restore to an isolated staging database/project using fictitious data first. Verify sample ticket, archive, feedback, membership and queue consistency. Backups alone do not constitute a tested recovery procedure.
4. For a production incident, stop queue issuance, preserve evidence, contact the responsible operator, verify scope and authorization, restore only after an approved recovery plan, then reconcile live tickets before reopening. Never blindly overwrite a live database. Firebase Auth accounts, security rules, hosting and operational configuration need independent recovery planning.
5. Store and rotate credentials securely, test restore regularly, and track backup retention/deletion separately. No real export, import, deletion or billing change is performed by this release.

## Acceptance before a real pilot
- Confirm deployment and both CI checks, then use a separate test hospital and fictional patients.
- Android/iPhone/desktop: scan, wait, call, skip, recall, complete, feedback, hard refresh and sleep/wake; test with no browser storage and with offline/online transitions.
- Reception: disconnect during an operation; reconnect and verify the existing ticket before retrying. Open two counters and race the same ticket. Switch accounts and verify no previous hospital receipt/history is visible. Change the allowed counter count while a test ticket is active on a high counter.
- Owner: verify valid and invalid branding, role revocation, PDF/CSV output, logout during report generation and mobile keyboard navigation.
- Public board: enable announcements and confirm live calls, then disconnect/reconnect; cached calls must not be replayed as new merely because a connection was lost.
- Run load testing in isolated staging with representative department/counter counts; measure Firestore reads, write contention, latency and quotas. Run manual accessibility testing, security/privacy assessment and a backup restore drill. Do not use real patient data for development testing.

No new Firestore rule publication is required if the previously published corrected v3.1 rules are active. The new emulator tests cover those exact rules. Live deployment and independent audit remain separate checks.
