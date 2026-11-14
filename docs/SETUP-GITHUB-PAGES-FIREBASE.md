# TurnAhead v2.4 · Firebase rules-first deployment

**GitHub Pages hosts the static website; Firebase Authentication and Firestore power staff permissions, QR status, and private historical records.** No Node.js is needed on staff or patient devices.

> **Do not merge the v2.4 PR to `main` until you have published and tested its matching `firestore.rules`.** Your current working v2.3 website stays available during preparation. Finish any active queues first.

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
- Support `displayName` and `gender` in invitations and staff memberships, while retaining compatibility with existing v2.3 accounts and invitations.

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

## Doctor-directory security and compatibility

- The new Firestore path `hospitals/{hospitalId}/doctors/{doctorId}` is **readable by active, verified hospital staff only** and writable only by the designated administrator. A soft-removed doctor remains available to the administrator for reactivation but cannot be selected for new tickets.
- New ticket writes validate the doctor’s active registration and department association. The historic ticket and archive store a **snapshot** of doctor name, room and patient title/gender. Older v2.3 ticket/archive shapes remain compatible during rollout.
- The new web interface **requires an active doctor** before a ticket can be issued. Configure at least one doctor per active department immediately after rules publication and merge.
- Firestore Security Rules emulator tests for all doctor/room authorization paths are strongly recommended. The project’s JavaScript tests cannot replace an emulator or manual Firebase access review.

## Step 3 · Publish the rules

1. Open the [v2.4 `firestore.rules` file on GitHub](../firestore.rules) **on the release branch**.
2. Select the entire file and copy it.
3. Open [Firestore Database → Rules](https://console.firebase.google.com/project/turnahead-b34f9/firestore/rules).
4. Replace the old rules and click **Publish**. Confirm the publication succeeded.
5. Recheck that your existing v2.3 staff sign-in and current queue still function. The new rules intentionally preserve legacy document layouts during this transition.

## Step 4 · Merge the PR and deploy the website

1. Open the v2.4 GitHub pull request, review changed files and green CI.
2. Click **Ready for review → Merge pull request → Confirm merge**.
3. Check [GitHub Actions](https://github.com/NittinChughani/TurnAhead/actions) for the Pages deployment to complete.
4. Visit [TurnAhead](https://nittinchughani.github.io/TurnAhead/) and test the new issue form and admin panel.

## Step 5 · Verify functionality on two devices

1. In Admin Login, invite a receptionist by entering exact email, staff name, Male/Female selection, and role. Share the generated activation link privately. Staff verify email and set their **own** password.
2. Log in as staff and confirm the right-side **Mr / Ms Name** greeting appears. Use Update details in the admin panel to correct a name or send a password-reset email.
3. Create a **Cardiology** queue, or finish the old day's queue to allow an existing prefix to migrate at the next reset.
4. First create a doctor in Admin → Doctors and select their department. As reception, issue a fictional patient ticket selecting Mr/Ms, the registered doctor and an assigned room. Confirm the QR and receipt show all three visit details, starting at `CAR-001` on a new date.
5. Scan the QR using a separate phone. Confirm the phone shows waiting position and an approximate local clock time (not a guaranteed appointment).
6. Click **Call next** on reception: the phone must display **YOUR TURN** once the state is synchronized. Click **Complete**: the phone must display **COMPLETED**, *not* **YOUR TURN**. Repeat with **Skip** and confirm **SKIPPED**.
7. Open the public board and confirm anonymous token numbers and the updating **12-hour HH:MM:SS AM/PM Pakistan time** clock, with no names.
8. Open Administrator → **Patient attendance archive**, choose the date and department, search a code like `CAR-001`, and click **Details** to check patient title/name, doctor, room, issued/called/finished times and attended/missed outcome. Use the direct calendar-date picker to open a date.
9. After midnight Pakistan time, the next ticket should restart at `CAR-001` without deleting the previous day's dated archive.
10. Verify a nonmember and another hospital's member cannot read the first hospital's private archive.

## Migration and historical data

- **Existing v2.3 tickets and dated records remain in Firestore**; older records naturally lack doctor/room and title fields. New ticket details are saved with each v2.4 issue.
- **Existing department prefixes** are preserved; v2.4 starts new daily sequences at `001`. Existing v2.3 ticket numbers are never renumbered or rewritten.
- Ticket numbers are formatted with **at least three digits**, beginning at `001` each Pakistan calendar day and continuing past `999` to `1000`, `1001`, etc. A queue's sequence is separate from every other department.
- New department names with the same initial three letters as an existing department are rejected to avoid ambiguous ticket codes.
- Archive documents are created and updated **immediately**, not by a scheduled 24-hour task. Day-index documents group records by date. If no browser is open at midnight, numbering resets automatically on the next issuance or authorized queue rollover.

## Privacy and performance

- Patient names are displayed to anyone who knows the **unique QR ticket URL**; public boards contain only anonymous numbers. Keep QR links private, and avoid medical information.
- Historical named records are restricted to the designated owner by Firestore rules. **Automatic record deletion/retention is not implemented**, so define organizational policy before real-world use.
- Firebase response speeds vary. Both logins show a loading animation immediately, but there is **no guaranteed three-second completion**; delayed networks can take longer. TurnAhead avoids artificial waiting and performs independent live subscriptions promptly.
- Browser-only JavaScript does not send automated staff invitations, create Firebase Authentication accounts for them, or perform true server-side timed archival jobs. An owner authorizes emails and staff self-activate with verified addresses.

**TurnAhead v2.4 is still a pilot.** Test full data protections, backup/recovery, privacy obligations and operational reliability before use in a real healthcare organization.

## TurnAhead v2.4 acceptance checks

1. **Navigation / themes:** Only one Staff Login entry appears in the homepage nav. Switch all pages to dark mode; history inputs, date picker, Details popup and staff account badge retain readable text and backgrounds.
2. **Doctors:** As owner add a doctor to Cardiology with default room B-204. As staff, open Cardiology’s issue form; that doctor appears, while doctors from other departments do not. Edit the doctor, deactivate them, verify they disappear from the new-ticket selector, then reactivate them. Older QR links keep their original doctor name and room.
3. **Ticket:** Issue a fictional Ms Lucky ticket for CAR-001 with a chosen doctor and room, print and scan it, and verify the displayed fields. Call it: tracking shows YOUR TURN. Complete it: tracking shows COMPLETED. Test Skip as well.
4. **Clock / loading:** Public board shows seconds and AM/PM. A newly scanned QR shows the visible spinner beneath “You’re in the loop” until real data arrives, then transitions automatically; network delays may exceed 2–3 seconds.
5. **Vibration:** With a compatible Android browser on HTTPS, tap **Enable turn alerts & vibration** on the phone, keep the page in view, then call that ticket at reception. Confirm haptics if supported. On iOS or unsupported browsers the page must remain functional with on-screen updates and optional notifications.
6. **Archive / security:** In the owner dashboard choose a specific date, department and ticket code. A result row shows name and **Details** button; the popup shows doctor, room, title, status and timestamps. A non-admin cannot read the archive or create/change doctor records.
7. **Regression:** Test the currently running v2.3 UI after deploying the rules and before merging; do not interrupt an active real queue. Verify with a second device after merging. There is no guarantee of a 2–3-second server response time.
