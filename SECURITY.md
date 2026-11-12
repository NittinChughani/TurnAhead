# Security and privacy

TurnAhead is an **early-stage queue-management pilot**. It is not a clinically validated hospital information system.

- Reception access is Firebase Authentication **plus** a manually provisioned `staff/{uid}` document with `active: true`. The website deliberately has **no public staff registration**.
- Firestore rules deny staff privilege to unapproved authenticated users. Only project administrators may add or revoke staff membership via Firebase Console or the Admin SDK. **Deploy `firestore.rules` before handing out reception access.**
- Patient ticket links use random 20-character Firestore document IDs; public reads are limited to direct ticket reads (`get`) and cannot list the tickets collection. Treat QR receipts and tracking links as bearer credentials.
- Anonymous public queue documents contain only department names, anonymous ticket codes, counts and service state. Staff-only `controls` documents contain ticket-ID mappings and cannot be read by visitors.
- **Do not collect patient names, diagnoses, phone numbers, addresses, medical records or appointment reasons** in this MVP. The security rules validate allowed document fields.
- Firebase web configuration is public configuration, not a password; never add a service-account JSON key, Firebase Admin SDK secret, or staff password to the GitHub repository.
- Browser notifications are available only with permission and while the page is open. Never rely on them as the sole means of announcing a patient's turn.
- The MVP maintains queue arrays in Firestore documents and is designed for modest pilot queues (up to approximately 2,000 waiting tickets per department), not large-scale facilities. Add server-side services, indexing, audit logging, abuse protection, retention policies, backups and observability before production clinical rollout.
- Tickets are not automatically deleted; configure retention/deletion before collecting any real operational data. Never use Firestore test-mode rules (`allow read, write: if true`).

Report vulnerabilities privately to the project maintainer.
