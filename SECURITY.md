# TurnAhead v2.5.2 · Security and patient-data privacy

TurnAhead is a **queue-management pilot**, not an electronic health record, medical identity-verification tool, or certified hospital platform. Public use with real patient names requires a privacy/security review and a lawful organizational basis for data collection.

## v2.5.2: avatar privacy, private PDF export and optional push

- Profile photos are **self-managed only**. Accepted file types are JPG/PNG/WebP; the client center-crops, downscales and removes EXIF metadata by rendering into Canvas. The resulting small raster data URL lives in the **private Firebase membership document**, not a public Cloud Storage object or user-controlled URL. Firestore rules restrict changes to `profilePhoto` and `updatedAt` for the authenticated, verified active member; roles and names are not self-editable. The hospital owner can read staff memberships and see photos in the authorized staff list. Photos are not embedded in patient QR tickets.
- The browser creates patient PDFs on **explicit administrator action** using a client-only PDF library. No patient records are sent to a third-party conversion service; JavaScript may retrieve the PDF-generation code from a public CDN. Protect downloaded files with hospital policy. The current default PDF font best supports Latin-script names; Unicode/localized PDF fonts need additional verification before multilingual deployment.
- Patient background push is **not active** on the default zero-budget website. Optional server code requires Firebase Cloud Functions (Blaze billing), Cloud Messaging and App Check. The locked-screen message contains only ticket code, not patient name/doctor/room. Notifications are permission-dependent, non-guaranteed and particularly constrained on iOS. The optional code must be independently security-tested before deployment; see [push setup](docs/PUSH-NOTIFICATIONS.md).
- The included optional push sender stores device push tokens in a server-only Firestore subcollection; client rules deny those reads/writes. Never place an FCM server key or service-account secret in GitHub Pages JavaScript.
- Test profile-photo access (self/owner/other staff/other hospital) and patient PDF access as part of the Firebase Rules Emulator validation. Code-level unit tests and screenshot previews do **not** replace security testing with Firebase.

## Changes requiring v2.5 security validation

- **Doctor-specific queues:** the department `queues` document contains public anonymous per-doctor waiting-number and currently-serving maps; the paired `controls` document contains private per-doctor ticket IDs and counters. Neither document should contain patient names, telephone numbers, medical data or reception staff UIDs.
- **Concurrent reception:** every call, completion and skip is made through a Firestore transaction that updates queue/control/ticket/dated record together; a counter can operate only one active ticket within a department. Counter labels can be selected by any authorized receptionist, so they are not identity credentials; record the staff UID separately in the owner-only archive.
- **Ticket issuance audit (v2.5.1):** the private dated archive now saves `issuedBy` (the issuing authenticated staff UID) and `issuedCounter` (the counter the receptionist selected when issuing). Only the owner can browse the archive. A QR ticket intentionally does **not** expose staff identities. Security rules verify any supplied `issuedBy` matches the authenticated creator, enforce the counter-label format and prohibit later edits. Historical pre-upgrade records may lack the new fields.
- **Counter limitation:** `Counter N` is a staff-selected operational label, **not independently verified evidence** of the physical desk. A receptionist may select another counter; staff audit uses Firebase identity.
- **Persistent call history:** public bearer-ticket responses include called time and counter. Staff identity remains restricted to private archives, but **anyone holding the QR link sees the patient's name, doctor, room, visit status and call time**.
- **Browser resume:** explicit server refreshes reduce stale status on Safari, but iPhone vibration and background-delivery are not guaranteed. The UI must show the final ticket state and original call time after reconnection.
- **Migration:** do not merge before rules are tested and current v2.4 queues have been cleared. No automatic transfer of in-progress v2.4 waiting tickets into per-doctor queues exists.
- **Before using patient data:** run Firestore Rules Emulator negative-access tests, manual two-device and simultaneous-counter tests, an independent privacy review, tested backups, incident handling and a retention/deletion procedure.

## Access model

- One authorized hospital owner (`role: owner`, matching `hospital.ownerUid`) operates its admin dashboard.
- Supervisors and receptionists need active hospital memberships from verified, exact-email invitations.
- The public staff login has **no signup option**. Staff create or access their Firebase Auth account only through an admin-issued invitation activation flow.
- The administrator can correct staff names, gender/title, role and status; password resets are delivered by Firebase to staff email. Administrators cannot read, choose or recover staff passwords.
- Firestore rules restrict private dated history (`hospitals/{hospitalId}/history/{day}/departments/{departmentId}/records/{ticketId}`) to the **designated hospital owner**. Reception staff can create/update those records as part of queue transactions, but cannot list or read patient history.

## Patient data: introduced in v2.4

- Patient name, chosen Mr/Ms title, registered doctor name and room are collected by reception and saved to the individual ticket and private date/department archive. Ticket code, department, timestamps, status and attendance are also stored.
- **The patient QR link is a bearer secret, not a login.** Any person with that unpredictable URL can read that ticket's **name, title, doctor, room and queue status**. Do not share, publish, photograph publicly or index QR links. Public boards show codes, waiting counts and time—never names.
- Do not enter diagnoses, national ID numbers, contact information, treatments, medications or other medical records. The app does not verify patient identity.
- `Completed` represents reception marking an encounter served/attended; `Skipped` represents reception marking it missed. These are operational actions, not independent proof of medical attendance.
- Dated archive records are written when tickets are issued and updated when the ticket is called, completed or skipped. A separate midnight cron job is **not** needed. Old v2.2 records are not backfilled automatically.
- **Automatic deletion is not implemented.** Data remains in Firestore until removed by an authorized organization/operator procedure. Agree on retention and deletion policies before collecting real patient names.

## Doctor directory and room data

- Hospital owner alone may add, edit or deactivate/reactivate doctor profiles. Verified staff may read doctor names, department assignments and default room to issue tickets; patients cannot enumerate the doctor directory.
- When reception issues a ticket, doctor name and room are **copied onto the patient ticket** and day/department archive. Later updates to a doctor profile do not alter already-issued tickets. Deactivation is a soft delete to preserve history.
- Patient title/gender is stored solely to render the requested honorific. Organizations should consider whether this field is necessary and provide appropriate patient notice and choices before collecting real information.
- Doctors, rooms and patient names are personal/operational data. QR links are bearer secrets; implement retention, staff authorization checks, access auditing and privacy notices before clinical use.
- Optional phone vibration depends on mobile hardware, browser support, active-page permissions and user interaction. It is never the sole way a patient learns that they are called.

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
