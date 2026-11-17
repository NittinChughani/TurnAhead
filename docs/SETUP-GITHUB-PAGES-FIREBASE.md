# TurnAhead v2.5.2 · Profile, ticket and PDF rollout

**Status:** source ready for a separate review branch. This release adds self-service staff/owner profile photos, improved print tickets, private patient PDF reports and **optional, not-yet-deployed push notification scaffolding**. The live site stays unchanged until coordinated rollout.

## Safe deployment checklist

1. Back up Firestore and verify the existing owner and staff memberships and v2.5.1 reception/queue status.
2. Test this branch's **`firestore.rules` in the Firestore Rules Emulator or a test project**. Confirm active verified users can update only their own photo; unregistered users, other staff members and cross-hospital users cannot change someone else's photo or role; the owner can still update names and roles; private patient history remains owner-readable only.
3. Publish the tested matching Firestore rules **before merging** the v2.5.2 review PR. Do not activate any push backend during this step.
4. Verify prior version's staff logins, patient tracking and ticket issuance remain functional with the new rules. Merge the code PR, confirm GitHub Pages deployment, hard refresh and test uploads, removals, profile avatars in staff lists, the printed QR receipt and **Download PDF** using fictional patient records.
5. Test profile uploads and print/PDF on desktop, Android and iPhone browsers, including slow network and failed CDN access. Manually verify the PDF content and print layout before real patient use.
6. Leave `public/push-config.js` keys **empty** if the project must remain entirely zero cost. For opt-in background Web Push only after agreeing to billing and a security review, follow [`PUSH-NOTIFICATIONS.md`](PUSH-NOTIFICATIONS.md). Do not promise iPhone lock-screen notifications without a deployed sender and Home Screen app testing.
7. Conduct privacy/compliance review, backup/recovery tests and hospital pilot before any production use.

---

# TurnAhead v2.5.1 · Firebase record-audit update and rollout checklist

**v2.5 is already merged into the repository.** This v2.5.1 change set is a separate refinement: a floating rounded glass navigation, dark-mode Chromium README screenshots and **private issuing-receptionist + issuing-counter audit fields**. Do not merge the v2.5.1 PR until its matching `firestore.rules` has been tested and published.

## v2.5.1 deployment steps

1. Check that the current v2.5 hospital admin, staff, doctor lanes and ticket issuance are working, and make a recoverable Firestore backup.
2. Test the new `firestore.rules` in the Firebase Rules Emulator or a nonproduction Firebase project. An authorized staff member must be able to issue a ticket and write a matching **private** record containing their own `issuedBy` UID and a valid `issuedCounter` (`Counter 1`–`Counter 12`). Attempting to claim another staff UID, alter an issuer after creation, or read another hospital's archive must fail. Test that staff members cannot list/read any archive.
3. Publish the matching rules from this branch in the Firebase Console **before** merging the code. Both older and new archive formats are allowed during the short transition; issuer identity is enforced whenever the new fields are present.
4. Merge the v2.5.1 PR and verify the GitHub Pages deployment. Issue a **fictional** ticket from Counter 2 and confirm Admin → Patient attendance archive → Details shows the issuing staff name and **Issuing counter: Counter 2**. Call it from Counter 3 and confirm the separate call counter is shown; older records should say **Not recorded**.
5. Verify the floating navbar at the top, disappearance after scrolling, and return when scrolling back to the top on desktop and mobile. Check dark-mode screenshots in the README. Do not use real patient information until the security/privacy and operational tests have been completed.

---

## Historical v2.5 migration guidance

The following migration section describes the previously merged v2.5 change from v2.4 and should not be repeated for this **v2.5.1** UI/record refinement.

**The following older v2.5 notes were written before its merge.** That feature branch contained per-doctor queues, twelve shared reception counter identities, safer transaction handling, connection-recovery improvements, doctor breaks and a translucent navigation bar. The accompanying Firestore rules **must be tested and published before the PR is merged**.

## Critical migration requirement

The former v2.4 queue uses one department-wide pending/active line. v2.5 introduces separate `lanes` maps, keyed by doctor ID, in both `hospitals/{id}/queues/{department}` and private `controls` documents. **There is no automatic migration of active waiting tickets**. Schedule a quiet period, **complete or skip all currently waiting/active v2.4 tickets**, make a verified Firestore backup, and only then roll out the new system. Old dated archives and ticket links remain, but they are not reconstructed into live doctor lanes. Ideally install at the next fresh Pakistan-local queue day.

## Deployment order

1. Check the designated hospital owner remains active and matches `hospital.ownerUid`; confirm staff members are verified, and that each department has at least one active doctor.
2. In the **Firestore Rules Emulator or a separate Firebase project**, test the complete v2.5 `firestore.rules`: authorized staff issue doctor-lane tickets; two counters call different doctors; duplicate call attempts are rejected by the transaction; only the correct counter can finish; a pause does not prevent completing an already-called ticket; and patient/owner/archive read restrictions remain intact.
3. Verify an unregistered user cannot update a queue, enumerate private archives or alter a doctor's assignment. Test all hospital and staff isolation cases.
4. Publish the **exact release-branch [`firestore.rules`](../firestore.rules)** in [TurnAhead Firebase Console](https://console.firebase.google.com/project/turnahead-b34f9/firestore/rules). The new permissions preserve older ticket and queue shapes to support rules-first rollout. Verify the existing v2.4 website still works.
5. Only then mark the **draft v2.5 PR** ready and merge it into `main`. Check the [GitHub Actions deployment](https://github.com/NittinChughani/TurnAhead/actions).
6. Test with **fictional patients**, two different reception counters and doctors, desktop browser, Android Chrome and iPhone Safari. Confirm waiting → called → completed; waiting → called → skipped; lock/unlock; browser background/resume; offline/reconnect; doctor pause; department pause; and midnight reset.
7. Do not use real patient data until a privacy/legal review, retention procedure, backup/restore test, monitoring and operator training are completed.

### What the iPhone fix can and cannot guarantee

The ticket's own persisted status is now authoritative. Tracking subscribes to Firestore cache/server metadata, performs an explicit server recheck when the browser returns to the foreground or reconnects, and periodically checks while the page is visible. Every called ticket retains its original `calledAt` timestamp and counter, even after completion. Safari/iOS can suspend background pages; no web-only design can guarantee displaying a very brief **YOUR TURN** state while suspended, or vibration via an unsupported Vibration API. A returning patient sees the **latest recorded outcome and call history**.

### Access and accountability

- The owner manages doctors and the private patient history. Approved receptionists and supervisors issue and manage queue tickets.
- The queue document exposes **anonymous** doctor-lane/ticket/counter metadata; no patient names or staff user IDs appear there. Private counter control documents are member-only.
- Date-wise patient records are owner-readable only. Reception may create/update matching records in the same transaction as the ticket and queue action; `calledBy`/`finishedBy` in these records are staff UIDs **not copied to QR tickets**.
- Reception counter labels are chosen locally (`Counter 1`–`Counter 12`); they are shared operational slots, **not proof of staff physical location**. Staff handover is possible by selecting the same counter, and actions have UID audit entries.
- Queue performance depends on Firebase/network conditions. There is no guaranteed 2–3-second load or delivery delay.

---

## Historical setup notes (v2.4 compatibility)

The notes below describe the previous release's doctor directory and patient archives. Use the migration checklist above as the authoritative procedure for v2.5; historical directions referring to older release numbers are informational only.

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
- Support `displayName` and `gender` in invitations and staff memberships, while retaining compatibility with existing v2.4 accounts and invitations.

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
- New ticket writes validate the doctor’s active registration and department association. The historic ticket and archive store a **snapshot** of doctor name, room and patient title/gender. Older v2.4 ticket/archive shapes remain compatible during rollout.
- The new web interface **requires an active doctor** before a ticket can be issued. Configure at least one doctor per active department immediately after rules publication and merge.
- Firestore Security Rules emulator tests for all doctor/room authorization paths are strongly recommended. The project’s JavaScript tests cannot replace an emulator or manual Firebase access review.

## Step 3 · Publish the rules

1. Open the [v2.5 `firestore.rules` file on GitHub](../firestore.rules) **on the release branch**.
2. Select the entire file and copy it.
3. Open [Firestore Database → Rules](https://console.firebase.google.com/project/turnahead-b34f9/firestore/rules).
4. Replace the old rules and click **Publish**. Confirm the publication succeeded.
5. Recheck that your existing v2.4 staff sign-in and current queue still function. The new rules intentionally preserve legacy document layouts during this transition.

## Step 4 · Merge the PR and deploy the website

1. Open the v2.5 GitHub pull request, review changed files and green CI.
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

- **Existing v2.4 tickets and dated records remain in Firestore**; older records naturally lack doctor/room and title fields. New ticket details are saved with each v2.5 issue.
- **Existing department prefixes** are preserved; v2.5 starts new daily sequences at `001`. Existing v2.4 ticket numbers are never renumbered or rewritten.
- Ticket numbers are formatted with **at least three digits**, beginning at `001` each Pakistan calendar day and continuing past `999` to `1000`, `1001`, etc. A queue's sequence is separate from every other department.
- New department names with the same initial three letters as an existing department are rejected to avoid ambiguous ticket codes.
- Archive documents are created and updated **immediately**, not by a scheduled 24-hour task. Day-index documents group records by date. If no browser is open at midnight, numbering resets automatically on the next issuance or authorized queue rollover.

## Privacy and performance

- Patient names are displayed to anyone who knows the **unique QR ticket URL**; public boards contain only anonymous numbers. Keep QR links private, and avoid medical information.
- Historical named records are restricted to the designated owner by Firestore rules. **Automatic record deletion/retention is not implemented**, so define organizational policy before real-world use.
- Firebase response speeds vary. Both logins show a loading animation immediately, but there is **no guaranteed three-second completion**; delayed networks can take longer. TurnAhead avoids artificial waiting and performs independent live subscriptions promptly.
- Browser-only JavaScript does not send automated staff invitations, create Firebase Authentication accounts for them, or perform true server-side timed archival jobs. An owner authorizes emails and staff self-activate with verified addresses.

**TurnAhead v2.5 is still a pilot.** Test full data protections, backup/recovery, privacy obligations and operational reliability before use in a real healthcare organization.

## TurnAhead v2.5 acceptance checks

1. **Navigation / themes:** Only one Staff Login entry appears in the homepage nav. Switch all pages to dark mode; history inputs, date picker, Details popup and staff account badge retain readable text and backgrounds.
2. **Doctors:** As owner add a doctor to Cardiology with default room B-204. As staff, open Cardiology’s issue form; that doctor appears, while doctors from other departments do not. Edit the doctor, deactivate them, verify they disappear from the new-ticket selector, then reactivate them. Older QR links keep their original doctor name and room.
3. **Ticket:** Issue a fictional Ms Lucky ticket for CAR-001 with a chosen doctor and room, print and scan it, and verify the displayed fields. Call it: tracking shows YOUR TURN. Complete it: tracking shows COMPLETED. Test Skip as well.
4. **Clock / loading:** Public board shows seconds and AM/PM. A newly scanned QR shows the visible spinner beneath “You’re in the loop” until real data arrives, then transitions automatically; network delays may exceed 2–3 seconds.
5. **Vibration:** With a compatible Android browser on HTTPS, tap **Enable turn alerts & vibration** on the phone, keep the page in view, then call that ticket at reception. Confirm haptics if supported. On iOS or unsupported browsers the page must remain functional with on-screen updates and optional notifications.
6. **Archive / security:** In the owner dashboard choose a specific date, department and ticket code. A result row shows name and **Details** button; the popup shows doctor, room, title, status and timestamps. A non-admin cannot read the archive or create/change doctor records.
7. **Regression:** Test the currently running v2.4 UI after deploying the rules and before merging; do not interrupt an active real queue. Verify with a second device after merging. There is no guarantee of a 2–3-second server response time.
