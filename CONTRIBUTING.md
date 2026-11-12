# Contributing to TurnAhead

Thanks for helping make waiting rooms clearer and calmer. This repository contains a GitHub Pages frontend, browser Firebase integration and Firestore Security Rules.

1. Fork or branch the repository, and keep any Firebase service-account credentials out of Git.
2. Run `npm run check` and `npm test` (Node.js is for development only; hospital staff don't need it).
3. Test changes with an isolated Firebase project and a Firestore rules emulator before changing authorization logic.
4. Verify the owner, administrator, supervisor, receptionist and anonymous visitor permissions. Include negative tests for cross-hospital access and invitation abuse.
5. Include desktop/mobile testing, two-device queue tracking and theme checks in the PR description.
6. Keep README, setup documentation, and brand assets consistent with every user-facing change.

Small, well-tested fixes are especially welcome. Do not include real patient data in examples or screenshots; follow [SECURITY.md](SECURITY.md).
