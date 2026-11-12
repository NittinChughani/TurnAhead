# Security and privacy · TurnAhead v2.1

TurnAhead manages **anonymous queue numbers**, not medical records. Do not enter patient names, diagnoses, phone numbers, national identity numbers or other patient-sensitive information into department names, queue tickets or public boards.

## Access model

- Firebase Authentication proves staff identity. **Verified email alone does not authorize hospital access.**
- Hospital owner is provisioned only alongside a new hospital workspace. Admins cannot create additional owners or elevate their own role to owner.
- Staff invitations are bound to an exact normalized, **verified** email, a hospital ID and a permitted role. The invitation becomes accepted atomically with membership creation.
- Only active hospital members can write that hospital's queue, control and ticket documents. Administrators can manage non-owner staff; only the owner can authorize other administrators.
- All queue, ticket, control, metadata and invitation paths are scoped under a hospital ID. A public board only displays anonymous queue status. Staff membership information is not available to unrelated hospitals.
- Patient ticket URLs use unpredictable 20-character Firestore IDs. **Anyone with that exact link can view that anonymous ticket**. Do not treat it as secret medical data or a way to establish identity.
- Reception queue-control documents contain internal ticket IDs and cannot be publicly listed or read.

## Safe rollout

Publish the v2.1 `firestore.rules` **before** merging the v2.1 frontend. A transitional compatibility rule permits previously approved v2.0 staff to continue older operations until **12 December 2026**. It must be removed once the old system is no longer needed; historical Firestore documents should be retained or deleted according to policy. Older printed QR links cannot become new hospital-scoped live tickets automatically.

## Limitations before commercial use

This is a pilot. The project has **not undergone an independent security audit**, live Firebase rules emulator tests, HIPAA or local healthcare regulatory assessment, penetration testing, disaster recovery testing or high-volume load testing. The web-only hospital onboarding currently permits any email-verified user to create a pilot workspace; it is **not** licensed tenant provisioning or evidence of hospital identity. A commercial deployment needs administrator approvals, monitoring, abuse protection, data retention, backups, operational incident response, service-level targets and legal review.

Never add a Firebase service account JSON, Admin SDK credentials, private signing keys or real patient data to GitHub. The web app's public Firebase configuration identifiers are not secrets; Firestore rules—not hidden browser configuration—enforce access.

## Reporting a vulnerability

Please **do not** post exploitable issues, patient data or credentials in public issues. Use GitHub's private security advisory reporting when enabled, or contact the repository maintainer privately through their GitHub profile. Include steps to reproduce without real patient information.
