<div align="center">

<img src="docs/assets/readme-hero.webp" alt="TurnAhead — Know when it's your turn" width="100%" />

<br />

### A clearer wait. A calmer day.

**Real-time, QR-powered walk-in queues — without another app, another account, or another question at the front desk.**

<br />

[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-112343?style=for-the-badge&logo=githubpages&logoColor=54E0BD)](https://pages.github.com/) [![Firebase](https://img.shields.io/badge/Powered_by-Firebase-112343?style=for-the-badge&logo=firebase&logoColor=FFCA28)](https://firebase.google.com/) [![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-112343?style=for-the-badge&logo=javascript&logoColor=F7DF1E)](https://developer.mozilla.org/docs/Web/JavaScript) [![MIT](https://img.shields.io/badge/License-MIT-167C72?style=for-the-badge)](LICENSE)

<br />

[**Launch TurnAhead ↗**](docs/SETUP-GITHUB-PAGES-FIREBASE.md) · [**Explore the workflow**](#the-experience) · [**Architecture**](#under-the-hood) · [**Roadmap**](#roadmap)

</div>

---

## Why TurnAhead?

A hospital waiting room. A diagnostic centre. A busy public service counter. You've taken your ticket — but now what?

You don't know how many people are ahead of you. You don't know whether the queue has stopped. You keep returning to reception because **nobody can tell you when your turn is getting close**.

**TurnAhead solves that moment.**

Reception issues a paper ticket with a unique QR code. The visitor scans it to see their live place in line, the approximate waiting window, and the token currently being served. **No patient sign-up. No app download. No standing around the desk asking for updates.**

> **Know when it's your turn. Spend less time wondering.**

<p align="center"><img src="docs/assets/flow.svg" alt="TurnAhead workflow: register, scan, track, move forward" width="100%" /></p>

## The experience

<table>
<tr>
<td width="50%" valign="top">

### For reception teams

- **Create departments:** independent service queues with distinct ticket prefixes
- **Issue walk-in tickets:** sequential codes and locally generated scannable QR receipts
- **One-tap controls:** call next, complete, skip, pause and resume
- **Monitor the day:** waiting, currently serving, completed and recent activity
- **Display the board:** share live anonymous queue numbers on a waiting-room screen

</td>
<td width="50%" valign="top">

### For people waiting

- **Scan once:** a private, unpredictable ticket link opens in any browser
- **See your progress:** people ahead, current token and estimated waiting window
- **Watch live changes:** updates appear across separate phones and computers
- **Choose your theme:** clean light and dark interfaces
- **Get an optional alert:** while the page is open, with browser permission

</td>
</tr>
</table>

### Four screens, one connected queue

| Experience | GitHub Pages route | Who uses it? |
|:--|:--|:--|
| **Landing page** | `index.html` | Everyone |
| **Reception desk** | `desk.html` | Authorized staff (Firebase Auth + staff approval) |
| **My Turn** | `track.html?ticket=...` | Only someone holding the random ticket link |
| **Live board** | `board.html` | Waiting room visitors and public displays |

<p align="center"><strong>Beautiful by design. Useful by default.</strong></p>

The interface keeps TurnAhead's original brand identity across every screen: its ticket-and-forward-motion logo, crisp typography, lively but restrained animations, deliberate whitespace, responsive layouts and a proper light/dark theme switch. The brand isn't an interchangeable dashboard template.

---

## Launch as a real website

**TurnAhead v2 runs on GitHub Pages with Firebase.** The previous Node.js server, Render configuration and local SQLite setup are no longer necessary. Visitors and reception staff use the website by opening a normal HTTPS link.

<div align="center">

**[Read the complete GitHub Pages + Firebase setup guide →](docs/SETUP-GITHUB-PAGES-FIREBASE.md)**

</div>

### Setup overview

1. **Create Firebase project** → register a Firebase Web app, enable **Firestore** and **Email/Password Authentication**.
2. **Add web config** → paste the public Firebase Web app settings into [`public/config.js`](public/config.js). This file initially contains placeholders; the queue cannot go live until you configure it.
3. **Publish security rules** → copy [`firestore.rules`](firestore.rules) into the Firestore Rules editor and publish. **Do not use Firestore test mode**.
4. **Authorize your receptionist** → create a Firebase Authentication user, then add `staff/<their UID>` with Boolean `active: true` through the Firebase Console.
5. **Turn on GitHub Pages** → Repository **Settings → Pages → Source: GitHub Actions**. The included workflow deploys `public/` automatically on changes to `main`.
6. **Open the website** → once deployment succeeds, visit **`https://nittinchughani.github.io/TurnAhead/`** (or your custom domain). Open Reception on one device and scan a new ticket on another.

> **Important:** A GitHub repository alone does not create a Firebase project. The URL above is the *expected* GitHub Pages address, not a claim that publishing or Firebase configuration has already been completed.

### What you'll see

```
GitHub Pages (static frontend)              Firebase (shared services)
────────────────────────────────             ─────────────────────────────
index.html    Beautiful introduction         Authentication → receptionist sign-in

desk.html     Issue + move queue        ↔    Firestore → staff-authorized writes

track.html    Patient's QR link         ←    Firestore → read one anonymous ticket

board.html    Public now-serving board  ←    Firestore → live public queue data
```

**The critical detail:** every browser connects to **the same Firestore database**. This is not a localStorage demonstration; one visitor's device receives queue changes made by the receptionist's device. Firestore transactions serialize concurrent ticket issuance so two reception desks do not give the same number.

---

## Under the hood

| Layer | Implementation | Reason |
|:--|:--|:--|
| Hosting | GitHub Pages + GitHub Actions | Free static web hosting with a familiar repository workflow |
| Interface | Semantic HTML, custom CSS, modern JavaScript modules | Fast, readable and framework-free |
| Shared state | Cloud Firestore and `onSnapshot` | Real-time queue and ticket updates across devices |
| Reception authentication | Firebase Email/Password + `staff/{uid}` approval | Only authorized reception accounts may alter queues |
| Queue consistency | Firestore `runTransaction` | Atomic ticket numbers, FIFO movement and status changes |
| Patient access | Random Firestore ticket ID in QR link | No login for visitors; no medical information stored |
| QR generation | Local bundled MIT-licensed QR encoder | No third-party QR API required |
| Theme | Light/dark mode with locally saved preference | Comfort and continuity on every screen |
| Tests | Node.js built-in test runner, CI | Development checks; **Node.js is not required to use the website** |

### A privacy-first queue model

- Public queue documents have **anonymous** token numbers and counts, not patients' names.
- Private queue-control documents contain the ticket-ID mappings and are readable only by authorized staff.
- Anyone holding a valid ticket link can read **that anonymous ticket**; Firestore rules prevent public listing of the tickets collection.
- Reception identities are individually authorized through Firebase. A login account alone is **not enough** for staff privileges.
- **Never store diagnoses, phone numbers, or other medical/personal details in TurnAhead.**

Read [SECURITY.md](SECURITY.md) before handling any real queue.

### Source layout

```text
TurnAhead/
├── public/
│   ├── index.html          # Website & product experience
│   ├── desk.html           # Reception interface
│   ├── track.html          # Visitor's QR-linked status
│   ├── board.html          # Shared public display
│   ├── assets/             # Official logo in both themes + favicon
│   ├── styles.css          # Responsive brand design & animation
│   ├── common.js           # UI theme, escaping, formatting
│   ├── config.js           # Public Firebase web configuration
│   ├── firebase.js         # Browser Firebase initialization
│   ├── queue-engine.js     # Tested queue calculations
│   ├── store.js            # Transactional Firestore operations
│   ├── qr.js               # Locally bundled QR generation
│   ├── desk.js             # Reception controls
│   ├── track.js            # Real-time patient tracking
│   └── board.js            # Real-time public board
├── firestore.rules         # Essential access controls
├── firebase.json           # Optional Firebase CLI rules configuration
├── docs/                   # Launch guide, artwork, flow chart
├── test/                   # Automated tests
└── .github/workflows/      # GitHub Pages deployment + checks
```

---

## Run developer checks (optional)

If you're contributing code, Node.js 22+ is handy for test automation **only**:

```bash
npm test
npm run check
```

Reception staff and patients **do not** run these commands. They use the hosted site.

## What the MVP intentionally does *not* do

This release focuses on **walk-in queues only**. It does not yet offer advance appointments, patient identity verification, medical records, SMS/WhatsApp delivery, guaranteed appointment times or clinical system integrations. Browser notifications only work with permission while the tracking page is open.

Queue state uses compact Firestore arrays, intentionally designed for **small pilot installations**; additional server-side architecture, retention controls, audit logs and testing are required before use at a large hospital. Firebase quotas/limits apply.

## Roadmap

- [x] Original TurnAhead brand and responsive landing page
- [x] Light/dark modes, motion, accessible interface
- [x] Independent walk-in departments and printable QR tickets
- [x] Live visitor tracking and public service board
- [x] Atomic queue updates with Firestore transactions
- [x] Firebase staff authorization and restrictive security rules
- [x] GitHub Pages deployment workflow
- [ ] Launch a configured Firebase project and activate GitHub Pages hosting
- [ ] End-to-end testing with reception and patient devices on the public URL
- [ ] Staff activity/audit history and data-retention controls
- [ ] Advance appointments and hybrid walk-in/scheduled queues
- [ ] SMS/WhatsApp integration with appropriate authorization
- [ ] Organization onboarding and multi-facility management

---

## Contributing & license

Issues, feedback and thoughtful pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). This project is released under the [MIT License](LICENSE); attribution for the bundled QR library is retained in its source and [license file](lib/qr/LICENSE).

<div align="center">

**TurnAhead**  
*More clarity. Less waiting. Better days.*

Made by [Nittin Chughani](https://github.com/NittinChughani) · Built for the places where a better queue can make a real difference.

[Back to top ↑](#why-turnahead)

</div>
