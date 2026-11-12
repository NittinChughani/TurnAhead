# TurnAhead security and privacy · v2.2

TurnAhead is a real-time queue management **pilot**, not an electronic health record or a certified hospital system. Do not store names, diagnoses, contact details, identity numbers or clinical records in queue names, public boards or ticket documents.

## Account and authorization boundaries

- Each hospital has **one** designated administrator: its active **owner** membership must match the hospital document's `ownerUid`. There is no public browser flow to create additional hospital owners or organizations.
- Only the designated hospital owner can add staff email invitations, change staff roles, disable staff access and update hospital settings.
- **Supervisor** can operate reception and create departments. **Receptionist** can operate reception. Neither can read the owner-only staff directory or invite colleagues.
- First-time staff account setup uses a separate invitation-activation page, not the public staff login page. An invitation is bound to the exact normalized email, hospital ID, role and expiration timestamp; accepting requires a Firebase-authenticated, **email-verified** account matching that email.
- Authentication and authorization are separate. Someone may hold a valid Firebase Auth account, including one created outside the TurnAhead UI, and **still have no hospital access**. Firestore rules deny access without an active authorized membership. The login UI displays an unregistered/access-denied state in that case.
- Legacy v2.1 secondary `admin` role memberships are no longer admin-authorized; the owner may downgrade them to supervisor or receptionist. Hospital owners cannot be changed from the browser.
- Client-side controls are for convenience; backend authorization is enforced by [`firestore.rules`](firestore.rules). Avoid assuming hiding buttons alone grants security.

## Ticket privacy

- Staff and owners see anonymous ticket codes, service departments, statuses and timestamps. No patient identity fields are collected.
- Each ticket URL uses a non-enumerable Firestore document ID. Anyone with the URL can read that **anonymous** ticket; this is a bearer link, not authentication or a way to verify patient identity.
- A hospital-specific public board intentionally reveals anonymous current-serving codes and queue waiting counts.
- Firestore rules deny unauthenticated listing of ticket collections, members and private queue controls.

## Rollout and reliability

- **Publish new Firestore rules before merging a new frontend.** Always test authorization on a non-production Firebase project or the emulator first.
- Root-level v2.0 compatibility is temporarily retained until **12 December 2026** and must be cleaned up after all legacy clients have stopped operating and archival requirements are addressed.
- Firestore snapshot listeners provide live updates; reception and patient views now subscribe without waiting for unrelated data. Network latency, offline clients and service quotas still affect speed.
- Operations and memberships should be audited, backed up and monitored before a hospital relies on the service. No full independent security audit or compliant clinical data processing review has been completed.

## Future account provisioning

v2.2 administrators **authorize a staff email invitation**, and staff activate their own account and password. Administrators do **not** create Firebase Auth users or know staff passwords. Fully server-managed account creation and trusted onboarding of new hospitals require Firebase Admin SDK or equivalent trusted backend processes, secure delivery of setup instructions, platform-operator verification, and operational access logging. Never embed Firebase Admin SDK secrets or a service-account JSON in the browser or GitHub repository.

## Reporting vulnerabilities

Please do not expose credentials, patient information or exploit instructions in public GitHub issues. Use the repository's private security advisory reporting, where available, or notify its maintainer privately through GitHub. Reproduce issues using test Firebase projects and synthetic data.
