# v3.3 development candidate (not a release)

Vercel publishing is cancelled for now. No hosting configuration, production deployment, live Firebase rules publication, billing changes, or real patient data used. Keep main/v3.2 untouched until integration is explicitly approved.

## Scope
- Landing feature showcase, consistent brand/navigation, responsive layouts, skeletons, guided setup and receptionist walkthrough.
- Analytics dashboard and branded paginated PDF, aggregate CSV, department/doctor performance, no patient identifiers in analytics.
- Isolated in-memory demo, installable manifest and network-only service worker. Installation depends on browser; no offline queue writes or private service worker caches.
- Searchable help, privacy/terms drafts, about, structured public issue drafts, site/device status with database state in workspaces.
- Doctor-specific uncertain waiting estimate, delay notice, patient progress, print/save private ticket QR, feedback and bounded reconnect reads.
- Same-department doctor transfers preserve code; cross-department transfers assign a fresh code in destination and append to destination lane. QR document ID stays unchanged. Only today's waiting tickets, same hospital. One immutable original archive path retains original issue code, department and issuer; service fields reflect destination. Subsequent call, completion, skip and recall update original archive. Analytics counts a visit once under final department; wait spans transfer. Inform the patient of the new number.
- Ticket corrections and transfer changes are atomically recorded in owner-only immutable change events. Other major operations log actor, kind and server timestamp with the operation, with no patient data. Client-origin events are not a tamper-proof audit and can be bypassed by older clients; extra writes consume free-tier capacity.
- Full-date archive filtering scans original department paths, matches current service department and either code, supports cancellation, paginates results, and fails explicitly above 200 queries or 10,000 records. Recent mode remains lower-cost.
- Legacy compatibility still expires December 12, 2026; confirm no legacy clients before removing. Do not extend it.
- Browser tests exercise the actual frontend with synthetic mocked signed-in adapters plus a real locally bundled jsPDF export. Firestore emulator independently validates authorization and transactions. Neither represents an authenticated live hospital test.

## Before integration
Verify latest quality, emulator and browser results. Run staging with fictional data and test real authentication, role revocation, cross-department transfer from both counters, current code on original QR, feedback, PDF appearance and mobile Safari/Android. Review privacy and terms, actual quotas, backup/restore and recovery. Do not publish rules or merge until coordinated rollout is approved. No production readiness or uninterrupted service guarantee.
