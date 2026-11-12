# Launch TurnAhead — GitHub Pages + Firebase

This is a **browser-based website**. Patients and reception staff never run Node.js, install software, or create Firebase accounts themselves. The project owner configures Firebase and enables Pages **once**.

## Step 1 — Create a Firebase project

1. Visit [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Register a **Web app** and copy its Firebase *web app configuration* (`apiKey`, `authDomain`, `projectId`, `appId`). These are public identifiers, not private keys.
3. Enable **Authentication → Sign-in method → Email/Password**.
4. Enable **Firestore Database** in your preferred region. **Do not leave Firestore in test mode**.
5. In **Authentication → Settings → Authorized domains**, add `nittinchughani.github.io` (or your actual domain). For GitHub Pages project sites, the authorized domain is the host, not the `/TurnAhead` path.

## Step 2 — Configure TurnAhead

1. On GitHub, edit `public/config.js`, replacing all `PASTE_...` values with your **Firebase web app config**. Set `facilityName` to the organization display name. Keep the file in the root of the `public` folder.
2. Firebase **service account** and private keys MUST NOT be added to the repository. Only the browser configuration belongs here.
3. In Firebase Console → Firestore → Rules, replace the rules with the contents of [firestore.rules](../firestore.rules) and **Publish**. The rules allow public queue reads, anonymous individual ticket reads by unpredictable ID, and authenticated staff actions only.

## Step 3 — Authorize reception access

1. Firebase Console → Authentication → Users → Add user. Enter the designated receptionist email and a strong, unique password.
2. Copy the new user's **UID** (not the email).
3. Firestore Database → Data → Start collection `staff`. Create document with ID equal to that exact UID and a Boolean field `active` = `true`. Do not create staff documents from the public app.
4. Open the website's **Reception** page and sign in with that email and password. The initial General OPD queue will be created automatically.
5. To revoke access, set `staff/{uid}.active` to `false` or disable the user in Firebase Authentication.

## Step 4 — Enable GitHub Pages

1. Open [TurnAhead repository Settings → Pages](https://github.com/NittinChughani/TurnAhead/settings/pages).
2. Under **Build and deployment**, choose **Source: GitHub Actions**.
3. Return to [Actions](https://github.com/NittinChughani/TurnAhead/actions) and run **Deploy TurnAhead to GitHub Pages**, or commit the `public/config.js` change to `main` to trigger deployment automatically.
4. GitHub will publish the **`public/` directory** at `https://nittinchughani.github.io/TurnAhead/` (unless you configure a custom domain). The live URL is confirmed only when the Actions deployment succeeds.

## Step 5 — Test with two devices

- On a reception browser, go to `/TurnAhead/desk.html`, log in, and issue a ticket. Click Print, or copy the tracking URL.
- On a different phone, open the ticket URL or scan its QR code. You should see your token, position and estimated wait.
- On reception, call next. The patient page and the public `/TurnAhead/board.html` should update automatically.
- Complete, skip, and pause/resume; verify that states synchronize. Test both light and dark themes.

## Common troubleshooting

| Symptom | Fix |
|---|---|
| Reception says "Connect Firebase first" | `public/config.js` still contains placeholder values; commit the correct public web configuration. |
| `auth/unauthorized-domain` | Add your GitHub Pages domain to Firebase Auth authorized domains. |
| `permission-denied` | Publish `firestore.rules` and verify `staff/{your UID}` has the **Boolean** field `active: true`. |
| Page loads but QR doesn't update | Check Firebase configuration, Firestore rules, browser connectivity and status of the Pages deployment. |
| GitHub Pages returns 404 | Select **GitHub Actions** as Pages source; check the workflow succeeded, and visit `/TurnAhead/`, not the repository code URL. |
| Old tickets persist | The system resets queue state at the next authorized reception sign-in after the Pakistan calendar date changes; older tickets display expired. |

## Operational limitations

This is a functional pilot, not an audited clinical production system. Keep tickets anonymous, avoid medical or personal data, and pilot with a small number of desks. Firebase free-tier limits and quotas apply. For larger-scale deployment, adopt server-side verification, queue event logging, automated data retention, monitoring, and disaster recovery.
