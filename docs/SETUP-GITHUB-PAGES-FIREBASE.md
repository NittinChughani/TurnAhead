# TurnAhead v2.3 · Firebase rules-first deployment

**GitHub Pages hosts the static website; Firebase Authentication and Firestore power staff permissions, QR status, and private historical records.** No Node.js is needed on staff or patient devices.

> **Do not merge the v2.3 PR to `main` until you have published and tested its matching `firestore.rules`.** Your current working v2.2 website stays available during preparation. Finish any active queues first.

## Step 1 · Confirm the project and administrator

Open the [TurnAhead Firebase project](https://console.firebase.google.com/project/turnahead-b34f9/overview). Confirm **Authentication → Sign-in method → Email/Password** is enabled, and `nittinchughani.github.io` appears under **Authorized domains**.

Your existing hospital administrator should have an active `owner` membership and should match the hospital document's `ownerUid`. Do not create an extra owner account or allow public owner registration.

## Step 2 · Review what changes

The updated Firestore rules:

- Accept the new `patientName` and `attendance` fields on tickets.
- Allow authorized receptionists to **write** matching date/department history records in Firestore transactions.
- Allow **only the hospital's designated owner** to list or read the named historical records.
- Permit reception to get a date-marker document (without patient data) to atomically initialize each day's history.
- Permit a supervisor/owner to reserve a unique three-letter department prefix.
- Support `displayName` and `gender` in invitations and staff memberships, while retaining compatibility with existing v2.2 accounts and invitations.

### Before live use, test these permissions in a Firebase emulator or separate project

| Test | Expected |
|:--|:--|
| Valid staff issues a named ticket and archive in one transaction | Allowed |
| Valid staff marks called, then completed or skipped | Ticket and archive status change together |
| Patient with exact QR ticket ID reads name and status | Allowed |
| Anonymous visitor lists all hospital tickets or dated history | Denied |
| Receptionist lists or gets a private dated patient record | Denied |
| Hospital owner opens dated patient history | Allowed |
| Staff attempts to read another hospital's archive | Denied |
| Staff attempts to create themselves as owner or change own role | Denied |
| Owner updates staff name/gender or sends a password reset | Allowed through owner controls / Firebase Auth |

**We have automated JavaScript tests, but have not run a live Firestore Rules emulator/security audit or verified Firebase production deployment in this environment.** Do not treat this as medical-software certification.

## Step 3 · Publish the rules

1. Open the [v2.3 `firestore.rules` file on GitHub](../firestore.rules) **on the release branch**.
2. Select the entire file and copy it.
3. Open [Firestore Database → Rules](https://console.firebase.google.com/project/turnahead-b34f9/firestore/rules).
4. Replace the old rules and click **Publish**. Confirm the publication succeeded.
5. Recheck that your existing v2.2 staff sign-in and current queue still function. The new rules intentionally preserve legacy document layouts during this transition.

## Step 4 · Merge the PR and deploy the website

1. Open the v2.3 GitHub pull request, review changed files and green CI.
2. Click **Ready for review → Merge pull request → Confirm merge**.
3. Check [GitHub Actions](https://github.com/NittinChughani/TurnAhead/actions) for the Pages deployment to complete.
4. Visit [TurnAhead](https://nittinchughani.github.io/TurnAhead/) and test the new issue form and admin panel.

## Step 5 · Verify functionality on two devices

1. In Admin Login, invite a receptionist by entering exact email, staff name, Male/Female selection, and role. Share the generated activation link privately. Staff verify email and set their **own** password.
2. Log in as staff and confirm the right-side **Mr / Ms Name** greeting appears. Use Update details in the admin panel to correct a name or send a password-reset email.
3. Create a **Cardiology** queue, or finish the old day's queue to allow an existing prefix to migrate at the next reset.
4. Issue a ticket with a fictional name. Confirm the receipt and QR page display the name and `CAR-000` or the next correct sequence number.
5. Scan the QR using a separate phone. Confirm the phone shows waiting position and an approximate local clock time (not a guaranteed appointment).
6. Click **Call next** on reception: the phone must display **YOUR TURN** once the state is synchronized. Click **Complete**: the phone must display **COMPLETED**, *not* **YOUR TURN**. Repeat with **Skip** and confirm **SKIPPED**.
7. Open the public board and confirm anonymous token numbers and the updating **HH:MM:SS Pakistan time** clock, with no names.
8. Open Administrator → **Patient attendance archive**, choose the date and department, search a code like `CAR-000`, and check name, issued time, called time and attended/missed outcome.
9. After midnight Pakistan time, the next ticket should restart at `CAR-000` without deleting the previous day's dated archive.
10. Verify a nonmember and another hospital's member cannot read the first hospital's private archive.

## Migration and historical data

- **Existing v2.2 tickets remain in Firestore**, but are not automatically backfilled into the new archive. The new archive begins with the first ticket issued using v2.3.
- **Existing department prefixes** (`A`, `B`, etc.) are upgraded on first activity after the next midnight rollover, avoiding changes mid-queue. A truly untouched legacy queue can adopt its new three-letter prefix immediately.
- Ticket numbers are formatted with **at least three digits**, beginning at `000` each Pakistan calendar day and continuing past `999` to `1000`, `1001`, etc. A queue's sequence is separate from every other department.
- New department names with the same initial three letters as an existing department are rejected to avoid ambiguous ticket codes.
- Archive documents are created and updated **immediately**, not by a scheduled 24-hour task. Day-index documents group records by date. If no browser is open at midnight, numbering resets automatically on the next issuance or authorized queue rollover.

## Privacy and performance

- Patient names are displayed to anyone who knows the **unique QR ticket URL**; public boards contain only anonymous numbers. Keep QR links private, and avoid medical information.
- Historical named records are restricted to the designated owner by Firestore rules. **Automatic record deletion/retention is not implemented**, so define organizational policy before real-world use.
- Firebase response speeds vary. Both logins show a loading animation immediately, but there is **no guaranteed three-second completion**; delayed networks can take longer. TurnAhead avoids artificial waiting and performs independent live subscriptions promptly.
- Browser-only JavaScript does not send automated staff invitations, create Firebase Authentication accounts for them, or perform true server-side timed archival jobs. An owner authorizes emails and staff self-activate with verified addresses.

**TurnAhead v2.3 is still a pilot.** Test full data protections, backup/recovery, privacy obligations and operational reliability before use in a real healthcare organization.
