# TurnAhead v2.1 · From working pilot to hospital workspaces

> **Release safety:** The v2.1 frontend and Firestore rules are a coordinated upgrade. **Publish the updated Firestore rules before merging v2.1 into `main`.** The rules retain time-limited v2.0 write compatibility through **11 December 2026**, so your current GitHub Pages app is not interrupted while you complete the upgrade. Do not merge first.

TurnAhead is hosted as a **static GitHub Pages website**, backed by Firebase Authentication and Cloud Firestore. Neither patients nor hospital staff install Node.js, run a local server, or create Firebase projects. A single Firebase project serves all demo hospital workspaces, with security rules isolating each hospital.

## Release checklist: existing TurnAhead installation

1. **Finish any active v2.0 queues before switching staff to v2.1.** Version 2.1 starts fresh, hospital-scoped queues; it does not automatically migrate waiting tickets. Existing `queues/`, `controls/`, `tickets/`, `meta/`, and `staff/` documents are left intact in Firestore. Old QR links show historical status and a legacy notice, but they do **not** become live tickets in the new workspace.
2. Open [Firebase Console → TurnAhead → Firestore → Rules](https://console.firebase.google.com/project/turnahead-b34f9/firestore/rules). Replace the currently published rules with the complete content of [`firestore.rules`](../firestore.rules) from the **v2.1 branch**, then click **Publish**. You can use the GitHub file's **Raw** view to copy all text. **Never use `allow read, write: if true` to make the new interface work.**
3. In [Firebase Authentication](https://console.firebase.google.com/project/turnahead-b34f9/authentication/providers), confirm **Email/Password** is enabled and `nittinchughani.github.io` is an **Authorized domain**.
4. Verify rules syntax in Firebase Console and preferably run the Firestore emulator and Security Rules tests on the proposed security rules before production use. The repository's Node tests **do not** replace full security rules and live Firebase tests.
5. **Merge the v2.1 GitHub pull request** (or merge the release branch to `main`) only after the rules are published. [GitHub Actions](https://github.com/NittinChughani/TurnAhead/actions) automatically deploys `public/` to your existing Pages URL.
6. Open [Reception](https://nittinchughani.github.io/TurnAhead/desk.html), sign in with your **existing Firebase account**, and verify your email if asked. If you are the hospital owner, create a new hospital workspace. You become the first **owner** automatically; no more manual Firebase UID approvals are necessary for new workspaces.
7. Open **Administration** to invite staff, add departments, and copy your hospital-specific public board link. Test the complete invite → verified email → accept → reception → ticket → patient QR flow with separate devices.
8. When the old rollout period ends, remove the v2.0 compatibility block from Firestore rules and plan any legacy-data retention/deletion with the hospital's approval. The transitional v2.0 write allowance expires automatically on **12 December 2026**.

## Setup: a fresh Firebase project

If you use a different project from `turnahead-b34f9`, register a Firebase **Web app**, enable **Authentication → Email/Password**, create **Cloud Firestore**, and copy its public web config to `public/config.js`. The config values are public web identifiers; **never commit service-account credentials, an Admin SDK key, or private tokens**.

Deploy the repository's full [`firestore.rules`](../firestore.rules) before creating hospitals; then enable [GitHub Pages](https://github.com/NittinChughani/TurnAhead/settings/pages) with **Source: GitHub Actions**. The included `.github/workflows/pages.yml` uploads `public/` and deploys it. For your own fork, update links and the Firebase project's authorized domain.

## First-time owner: create your hospital

1. Visit `desk.html` and choose **Create an account**, or sign in with an existing Firebase email/password account.
2. Confirm the **email verification** message from Firebase. Return and click **I've verified my email**. Old manually-created reception accounts might require verification now.
3. Enter a hospital or clinic display name and click **Create hospital workspace**.
4. Your hospital receives an unpredictable workspace ID. You receive an immutable **owner** membership for that specific hospital; the initial General OPD queue is created there.
5. Choose **Administration**. Create and share an invitation, assign a role, and add any additional departments.

**Note:** Any verified email user can create a pilot workspace. This is not paid tenant provisioning, professional hospital verification, a billing system or a regulated clinical service. Before selling subscriptions, add organization approvals, abuse prevention, billing and formal security/compliance checks.

## Invite and manage staff

From `admin.html`:

1. Enter the staff member's **email** and choose **Receptionist**, **Supervisor**, or **Administrator** (only the hospital owner may invite administrators).
2. Click **Create invitation**. It expires after **7 days**. Copy the provided link and **send it yourself** by your preferred communication method. Version 2.1 does **not** send an invitation email automatically.
3. The staff member opens the link, creates a Firebase email/password account (or signs in), **verifies the exact invited email address**, then selects **Join this hospital**.
4. The staff member opens reception directly. Hospital staff can switch workspaces if they belong to more than one.
5. Owners/admins can **deactivate or reactivate** non-owner staff, and change permitted roles. A receptionist cannot promote themselves; the hospital owner role cannot be transferred or disabled through the browser.

Firebase rules enforce the invitation and membership creation in an **atomic batch**. A copied invitation URL is insufficient by itself: the person accepting must verify the exact invited email address. Each hospital is isolated by its workspace ID and security rules.

| Role | Live reception | Add departments | Invite/manage staff | Change hospital name |
|:---|:---:|:---:|:---:|:---:|
| **Owner** | ✓ | ✓ | ✓ (including admins) | ✓ |
| **Administrator** | ✓ | ✓ | ✓ (non-admin staff) | ✓ |
| **Supervisor** | ✓ | ✓ | — | — |
| **Receptionist** | ✓ | — | — | — |

## Share the correct public links

Every hospital has its **own** public queue board. Open Administration → **Copy public board link**, which uses the form:

```text
https://nittinchughani.github.io/TurnAhead/board.html?hospital=<hospital-id>
```

New QR tickets use:

```text
https://nittinchughani.github.io/TurnAhead/track.html?hospital=<hospital-id>&ticket=<random-ticket-id>
```

Patients need no login. **Keep ticket links private**: anyone who has a ticket link may view that ticket's anonymous status. Never attach a patient name, phone number, diagnosis, or medical information.

## Verification before a real clinic pilot

- Test **first owner onboarding**, existing user sign-in, new account email verification, successful login toast, automatic dashboard view, and successful sign-out toast.
- Invite one receptionist; verify the same email can claim the invitation, while a **different verified email cannot**. Attempt to accept a revoked or expired invitation.
- Verify a receptionist cannot open Administration, create departments, list other hospitals' memberships, or change any staff permissions. Verify an administrator cannot create/promote another administrator; the owner can.
- Create two hospitals and check that switching between them never mixes queues, staff, tickets, or public boards.
- Issue a ticket, scan its QR on another phone, call next, complete, skip and pause on reception, and verify updates reach the correct patient and board.
- Check separate desktop/mobile browsers, both visual themes, reloading while signed in, print receipts, and recovery from disconnects.
- Conduct **Firestore Rules emulator tests** before production use. This repository's automated JavaScript tests cover the pure queue and role logic, **not live Firebase security enforcement**.

## Troubleshooting

| Symptom | What to check |
|:---|:---|
| `Permission denied` after opening v2.1 | Did you publish the **new** `firestore.rules` in Firebase Console before merging? Is the email verified? |
| Account signs in but sees "Verify your email" | Open the verification email and select **I've verified my email**. |
| Staff cannot join | The invitation must match their **verified** email and be pending, not expired or revoked. |
| No hospital on staff login | Open the invite link sent by the administrator; or ask them to invite the correct email. |
| Admin panel access denied | Only an active **owner** or **admin** member can enter Administration. |
| Live board says to ask reception | Board URLs require `?hospital=...` — copy the link from the hospital admin screen. |
| GitHub Pages 404 | Enable **GitHub Actions** in Settings → Pages, check its deployment run, and use the `/TurnAhead/` path. |
| Old v2.0 queue no longer live | A new hospital workspace has separate queues. Finish/close old tickets first and issue new QR tickets. |

## Limits and responsibilities

This release is a **functional multi-organization pilot**, not a hospital-certified production system. It has no subscription/billing enforcement, no audit-history export, automated backups, patient data retention system, hospital identity verification, guaranteed uptime, automated invitation email delivery or clinical privacy certification. Concurrent tickets use Firestore transactions; waiting arrays are intended for smaller queues. Firebase quotas and costs apply and large deployments require backend scaling and professional security and operational reviews.
