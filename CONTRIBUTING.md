# Contributing to TurnAhead

TurnAhead is a lightweight, open-source real-time queue experience. Contributions should preserve the clean interface, anonymous patient tickets, real-time updates, mobile accessibility, and Firebase-enforced security.

## Before you open a pull request

1. Read the updated [security model](SECURITY.md) and [Firebase setup guide](docs/SETUP-GITHUB-PAGES-FIREBASE.md).
2. Implement and test changes locally using `npm run check` and `npm test` (Node 22 is used only for development and GitHub CI).
3. Add tests for authorization-related logic and run real Firestore Security Rules emulator tests before editing production rules.
4. Do not introduce public hospital signup, secondary administrator roles, unverified staff access, or unauthenticated access to hospital-private data.
5. Preserve the original TurnAhead branding and test mobile layouts, QR tracking, and the two-device queue flow.
6. Never submit real patient records, passwords, Firebase private keys, Auth tokens or service-account credentials.

A clear pull request explains what changed, why it helps patients or hospital staff, what security rules it needs, and how it was tested. **Rules and frontend updates must be deployed in a coordinated order**, not independently during active queue operations.
