# TurnAhead v2.2 · Coordinated Firebase upgrade

**Use this guide for an existing TurnAhead v2.1 installation.** The website is hosted on GitHub Pages. No Node.js or local installation is required for staff or patients.

> **Order matters:** Publish and test the new Firestore security rules **before merging v2.2 into `main`**. Merging first can break the live reception and admin panels. Complete any active queues before changing access arrangements.

## Step 1 — Check the designated hospital owner

1. Open [Firebase Console](https://console.firebase.google.com/project/turnahead-b34f9/overview).
2. Go to **Firestore Database → Data → `hospitals`**. Open your existing hospital document and note its document ID (`hospitalId`) and `ownerUid`.
3. Go to **Authentication → Users** and locate the matching UID. This is the designated **hospital administrator**. The account must use Email/Password sign-in and have a verified email.
4. Go to **Firestore → Data → `memberships`**. Confirm that the document ID is `hospitalId_ownerUid` (with underscore) and that its `uid`, `hospitalId`, `role: "owner"`, and `active: true` match.
5. **Do not paste passwords or Firebase service-account credentials into ChatGPT, GitHub, Firestore, or screenshots.**

**Existing owners continue to work.** Any v2.1 secondary role named `admin` is now a *legacy role*: it cannot open the sole-administrator dashboard. After deployment, the owner can change it to **Supervisor** or **Receptionist**. Do not delete the owner's membership.

## Step 2 — Publish the new Firestore rules

1. Open [TurnAhead's Firebase Firestore Rules](https://console.firebase.google.com/project/turnahead-b34f9/firestore/rules).
2. Open [`firestore.rules`](../firestore.rules) on the **v2.2 branch** in another tab.
3. Copy the entire file. In Firebase's Rules editor, select all old text and paste the new rules.
4. Confirm the file begins with `rules_version = '2';`.
5. Click **Publish**. If Firebase rejects the rules, do **not** merge the new website; fix the error first.
6. Where possible, test the rules in the Firestore emulator against a disposable project before enabling production use. Unit tests alone cannot prove security rules work correctly.

The rules deny public hospital creation and new owner membership creation, allow staff activation only through an existing invitation for an **exact verified email**, and let only the hospital owner manage staff. An unrelated signed-in account cannot read private hospital data.

The old v2.0 compatibility rules remain time-limited through **11 December 2026**. Remove them after old clients stop using the root-level collections and your archival plan is complete.

## Step 3 — Confirm Authentication

Go to [Authentication → Sign-in method](https://console.firebase.google.com/project/turnahead-b34f9/authentication/providers). **Email/Password** must be enabled. Under Authentication → Settings → Authorized domains, verify `nittinchughani.github.io` is allowed.

No anonymous sign-in, public staff registration, or new Firebase project is required.

## Step 4 — Verify access security before merging

Use a test project where possible and verify these cases with **Firestore Rules emulator tests**:

| Attempt | Required result |
|:--|:--|
| Active owner reads hospital staff and tickets | Allowed |
| Receptionist accesses another hospital's members | Denied |
| Uninvited verified email creates a hospital membership | Denied |
| Any ordinary user creates a hospital or owner role | Denied |
| Staff account assigns itself Supervisor or administrator role | Denied |
| Hospital owner invites a receptionist or supervisor | Allowed |
| Another staff member promotes themselves to administrator | Denied |
| Revoked/expired invitation is claimed | Denied |
| Patient with ticket link reads its anonymous status | Allowed |
| Patient lists all private hospital tickets | Denied |

**Important:** The repository includes static logic tests, not a full Firebase emulator test of deployed security rules. If you have not verified these cases, keep it a pilot rather than handing it to a hospital.

## Step 5 — Merge the v2.2 release

1. Open the v2.2 GitHub pull request and inspect the changed code and CI checks.
2. Click **Ready for review**, then **Merge pull request** and **Confirm merge** after Steps 1–4 are completed.
3. Open [GitHub Actions](https://github.com/NittinChughani/TurnAhead/actions) and verify **Deploy TurnAhead to GitHub Pages** succeeds.
4. Visit [TurnAhead](https://nittinchughani.github.io/TurnAhead/). The navigation should show **Admin Login**, **Staff Login** and **Public Board**.

## Step 6 — Add one authorized staff member

1. Open **Admin Login**, sign in using the hospital's designated owner account and verify your email if prompted.
2. In **Add authorized staff**, enter the employee's exact work email, choose **Receptionist** or **Supervisor**, and click **Add staff email**.
3. Copy the resulting `activate.html?invite=<hospitalId>` URL and share it privately with the employee. The invite is valid for **7 days**. TurnAhead currently **does not email the invitation automatically**.
4. The employee opens the link. If new, they create their own password on the **separate activation page**, then verify their email. Existing Firebase users can sign in there instead.
5. They click **Join hospital** after verification. This creates the active membership atomically with claiming the approved invitation.
6. The employee now opens **Staff Login** at `desk.html`. There is **no signup button** on the staff login page.
7. Test with a second account not in the invitation list. It must **not** reach hospital reception data. Some unregistered emails will first receive Firebase's generic incorrect-credentials response; the app does not disclose whether arbitrary accounts exist.
8. From the administrator dashboard, disable the staff membership and verify that private operations are no longer permitted.

**Important distinction:** The admin approves the email and creates the pending invitation; the employee activates their Firebase Authentication user. TurnAhead does **not** secretly create Firebase Auth users or assign passwords on their behalf. Creating Auth users directly from an admin panel without employee activation requires a trusted Firebase Admin SDK backend, secure invitation delivery, and a separate deployment model.

## Step 7 — Check live performance

1. Start **Staff Login** on a computer and issue a QR ticket.
2. Scan the ticket on a separate phone. The tracking page now begins observing ticket status immediately, even while the hospital display name is loading.
3. Call the next patient, complete the ticket, then open the hospital-specific Public Board link.
4. Updates should arrive via **real-time Firestore listeners** without refreshing. Performance still depends on network latency, Firebase service health, device processing speed and project quota limits. This update removes unnecessary startup waiting; it is not a guarantee of an exact update time.

## Provisioning a **new** hospital after v2.2

Public users cannot register their own organization or make themselves an owner. For an entirely new hospital, the platform operator must use an **authorized server-side provisioning process** (recommended: Firebase Admin SDK / Cloud Functions with organization approval) to create a hospital document and exactly one owner membership. The first owner can then invite and manage staff through the website. The current v2.2 website intentionally contains **no public or operator-provisioning button**. This is a deliberate safety limit, not a missing UI feature.

## Troubleshooting

| Symptom | Check |
|:--|:--|
| Admin Login says access denied | Is this the hospital's existing `ownerUid` user, email verified, with an active `owner` membership? |
| Staff Login says not registered | The employee must have **accepted** an invitation using the exact verified email. A pending invitation alone is not an active membership. |
| Staff invitation cannot be accepted | Check correct hospital ID, unexpired pending invitation, Firebase authorized domain and verified email. |
| Firestore permission denied after merge | Verify v2.2 rules were published before the frontend and that memberships have correct roles. |
| Someone wants to create another administrator | v2.2 supports exactly **one owner**. Additional administrator accounts are intentionally disabled. |
| Public Board does not show queues | Use the hospital-specific link copied from the admin panel, with `?hospital=...`. |
| Old tickets do not appear | v2.0 root-level tickets and v2.1 hospital tickets are separate. They are not automatically migrated. |

## Commercial deployment caveat

TurnAhead remains a queue-management **pilot**. It does not store medical records, supply verified medical identities, guarantee update latencies or provide healthcare compliance certification. Before a commercial hospital installation, arrange an external security assessment, Firebase Rules tests, staff revocation tests, backups and retention policies, infrastructure monitoring, incident response and data protection review.
