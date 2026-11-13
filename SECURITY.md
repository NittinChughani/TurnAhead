# TurnAhead v2.3 · Security and patient-data privacy

TurnAhead is a **queue-management pilot**, not an electronic health record, medical identity-verification tool, or certified hospital platform. Public use with real patient names requires a privacy/security review and a lawful organizational basis for data collection.

## Access model

- One authorized hospital owner (`role: owner`, matching `hospital.ownerUid`) operates its admin dashboard.
- Supervisors and receptionists need active hospital memberships from verified, exact-email invitations.
- The public staff login has **no signup option**. Staff create or access their Firebase Auth account only through an admin-issued invitation activation flow.
- The administrator can correct staff names, gender/title, role and status; password resets are delivered by Firebase to staff email. Administrators cannot read, choose or recover staff passwords.
- Firestore rules restrict private dated history (`hospitals/{hospitalId}/history/{day}/departments/{departmentId}/records/{ticketId}`) to the **designated hospital owner**. Reception staff can create/update those records as part of queue transactions, but cannot list or read patient history.

## Patient data: new in v2.3

- Patient name is collected by reception and saved to the individual ticket, and to a separate private date/department archive. Ticket code, department, timestamps, status and attendance are also stored.
- **The patient QR link is a bearer secret, not a login.** Any person with that unpredictable URL can read that ticket's **name and queue status**. Do not share, publish, photograph publicly or index QR links. Public boards show codes, waiting counts and time—never names.
- Do not enter diagnoses, national ID numbers, contact information, treatments, medications or other medical records. The app does not verify patient identity.
- `Completed` represents reception marking an encounter served/attended; `Skipped` represents reception marking it missed. These are operational actions, not independent proof of medical attendance.
- Dated archive records are written when tickets are issued and updated when the ticket is called, completed or skipped. A separate midnight cron job is **not** needed. Old v2.2 records are not backfilled automatically.
- **Automatic deletion is not implemented.** Data remains in Firestore until removed by an authorized organization/operator procedure. Agree on retention and deletion policies before collecting real patient names.

## Deployment protections

1. **Publish rules first** from the same release branch, then deploy the GitHub Pages frontend. Finish active queues before migration.
2. Test rules using the Firebase Emulator or a dedicated nonproduction Firebase project. Unit tests verifying file structure are **not** a substitute for testing actual authorization behavior.
3. Confirm only a verified owner can list dated history; ordinary reception staff can create/update a patient ticket and its matching history record atomically but cannot retrieve archive data.
4. Test cross-hospital access, invitation expiry/revocation, staff disabling, and direct Firestore requests—not just hidden buttons in the UI.
5. Test QR links on separate devices for waiting → called → completed and waiting → called → skipped; verify no contradictory terminal states.
6. Apply least privilege to Firebase project operators, restrict service-account credentials, and add backups, monitoring, incident reporting and auditing before real-world rollout.

## Limits

- Firebase latency and sign-in time depend on connectivity and service health. No exact 1.5-second or 3-second upper bound can be promised; the UI shows progress while authorization is pending.
- Browser-only hospital software cannot run reliable server-side jobs while every browser is closed. Archive writes are transactional; midnight ticket rollover occurs upon the next authorized queue activity.
- A patient's name on a bearer QR URL is a privacy tradeoff. For deployment in a real hospital, consider a **separate, authenticated or expiring patient-view token** and stronger data minimization rather than treating the current pilot as production-ready.
- The Firestore rules have not been independently audited. Security tests and policy/compliance evaluation remain required.

For vulnerabilities, use private maintainer contact or GitHub's vulnerability reporting if enabled; do not open a public issue containing patient information or sensitive exploitation details.
