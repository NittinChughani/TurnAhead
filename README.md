<div align="center">

<img src="docs/assets/readme-hero.webp" alt="TurnAhead — Know when it's your turn" width="100%" />

<br/>

**A clearer wait. A calmer day.**

A real-time, QR-powered queue experience designed for the places where waiting shouldn't mean uncertainty.

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-122447?style=for-the-badge&logo=nodedotjs&logoColor=3ad4ad)](https://nodejs.org/) [![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-122447?style=for-the-badge&logo=javascript&logoColor=ffd966)](https://developer.mozilla.org/docs/Web/JavaScript) [![License: MIT](https://img.shields.io/badge/License-MIT-122447?style=for-the-badge&logo=opensourceinitiative&logoColor=3ad4ad)](LICENSE) [![Status](https://img.shields.io/badge/Release-Walk--in_MVP-0c8c78?style=for-the-badge)](#roadmap)

**[Deploy online](#launch-a-live-website)** &nbsp;·&nbsp; **[Explore the product](#the-experience)** &nbsp;·&nbsp; **[Technical overview](#under-the-hood)**

</div>

---

## Why TurnAhead?

A hospital waiting room. A diagnostic centre. A busy service counter. You've taken your ticket — but now what?

You don't know how many people are ahead. You don't know whether the queue has stopped. You keep checking reception because **nobody can tell you when your turn is getting close**.

TurnAhead solves that moment.

Reception issues a ticket with a unique QR code. A visitor scans it and sees a live queue position, approximate waiting window, and the token currently being served — **without downloading an app or creating an account**.

> **Know when it's your turn. Spend less time wondering.**

<br/>

## The experience

<p align="center"><img src="docs/assets/flow.svg" alt="TurnAhead: Register → Scan → Track → Next turn" width="100%" /></p>

<table>
<tr><td width="50%" valign="top">

### 🧑‍💼 For reception teams

- Create independent department queues
- Issue numbered, print-ready QR tickets
- Call next, complete, skip, pause or resume
- See waiting, active and completed totals
- Share a public board for the waiting area

</td><td width="50%" valign="top">

### 📱 For visitors

- Scan a ticket — no login or app download
- View their turn and people ahead
- Follow live queue movement
- See an **estimated window**, not a false promise
- Enable optional in-page browser alerts

</td></tr></table>

### Four connected screens

| Screen | Purpose | Access |
|---|---|---|
| **Home** `/` | A clear product introduction with an illustrated queue journey | Public |
| **Reception** `/desk` | Manage real queue state and issue QR tickets | Password-protected |
| **My Turn** `/track/:secret` | Private-link patient queue tracking | Anyone holding the ticket |
| **Queue Board** `/board` | Display current tokens by department | Public, anonymous |

<br/>

## Built with intention

**Designed to be human.** A light, breathable interface; a genuinely usable dark theme; subtle motion that respects reduced-motion preferences; consistent original branding; clear visual hierarchy; and a layout that works from reception desktops to patient phones.

**Built to actually work.** Queue state is stored in SQLite rather than a browser mockup. Server-Sent Events (SSE) propagate queue changes to connected patient and public-board pages. QR codes are generated locally as SVGs, so we do not send tracking links to an external QR service.

**Privacy by default.** Ticket numbers and random tracking secrets, not medical records. No diagnoses, personal names, or patient contact details are required for the walk-in MVP.

<br/>

## Launch a live website

**TurnAhead is built to be used in the browser, not through a command line.** After it is deployed, reception staff and visitors just open the public HTTPS website, use reception login, and scan QR tickets. The backend is hosted for you.

<p align="center">
  <a href="https://render.com/deploy?repo=https://github.com/NittinChughani/TurnAhead"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy TurnAhead to Render" /></a>
</p>

**[Deploy online in a few clicks →](docs/DEPLOY-ONLINE.md)** — Connect a hosting account, choose a reception password, and open the public URL provided by Render. No local Node.js installation is needed to use the website. The deploy button uses the included [`render.yaml`](render.yaml).

> **Demo hosting limitation:** The free Render instance is only suitable for trying the app. Its SQLite data can be lost during restart, sleep, or redeployment. **Do not use the free preview for real patient queues.** For organizations, use a paid persistent disk, security review and backups as explained in the [deployment guide](docs/DEPLOY-ONLINE.md). A GitHub repo is not automatically a live website.

<br/>

## Getting started

**Requirements:** Node.js **22.13+** (uses the built-in `node:sqlite` module). No `npm install` required.

```bash
git clone https://github.com/NittinChughani/TurnAhead.git
cd TurnAhead
cp .env.example .env
```

Edit `.env` and set a unique `ADMIN_PASSWORD` (**12+ characters**) and random `SESSION_SECRET` (**32+ characters**). Then:

```bash
npm start
```

Open **http://localhost:3000** for the public site, and **http://localhost:3000/desk** to log into reception. Create a ticket, scan its QR code or copy its tracking link, and use **Call next** to see the live updates.

> For phone scans, `localhost` on your computer does not resolve on the phone. Deploy to an HTTPS public URL, set `PUBLIC_URL=https://your-domain.example`, and print tickets from that deployment. For local-network testing, use a reachable host address.

### Useful commands

```bash
npm run dev     # Restart on server edits
npm run check   # JavaScript syntax checks
npm test        # End-to-end API and queue lifecycle tests
```

### Configuration

| Variable | Meaning |
|---|---|
| `ADMIN_PASSWORD` | Reception password, required, minimum 12 characters |
| `SESSION_SECRET` | Cookie signing secret, required, minimum 32 characters |
| `PORT` | HTTP port (default `3000`) |
| `FACILITY_NAME` | Name displayed throughout the application |
| `TIME_ZONE` | Facility's timezone (default `Asia/Karachi`) |
| `DATA_DIR` | Persistent directory for the SQLite database (default `./data`) |
| `PUBLIC_URL` | Optional public HTTPS origin used in printed QR tickets; automatically uses Render URL when hosted there |
| `NODE_ENV` | Use `production` for HTTPS deployment with Secure cookies |

### Deploying

A one-click Render preview blueprint (`render.yaml`) and ready-to-build `Dockerfile` are included. Deploy **one running instance per facility** on a platform that supports a long-running Node server and a **persistent mounted volume** for `DATA_DIR`. Configure HTTPS, `PUBLIC_URL`, and both required secrets.

**Do not deploy the database on ephemeral storage** or scale this MVP across multiple instances without moving to shared persistence and a distributed event bus. Static hosting alone (such as GitHub Pages) cannot run the queue backend.

<br/>

## Under the hood

```text
                 ┌───────────────────────────┐
                 │     Node.js HTTP API      │
                 │  Session / Queue Engine   │
                 └──────┬───────────┬────────┘
                        │           │
              ┌─────────▼───┐  ┌────▼─────────┐
              │   SQLite    │  │  Live SSE    │
              │ Tickets &   │  │  event feed  │
              │ departments │  └────┬─────────┘
              └─────────────┘       │
                        ┌───────────┼──────────┐
                        ▼           ▼          ▼
                   Reception   Patient QR   Queue board
                   controls    tracking     (no PII)
```

- **Backend:** Node.js standard library, `node:sqlite`, signed HTTP-only session cookies.
- **Database:** SQLite, atomic transactions for issuing and advancing tickets, WAL mode.
- **Real time:** Server-Sent Events with a polling fallback on patient and board views.
- **QR generation:** Locally generated SVG (vendored MIT-licensed QR encoder).
- **Frontend:** Responsive HTML, CSS and vanilla JavaScript; no frontend framework or runtime npm dependencies.
- **Testing:** Node's built-in test runner checks login, ticket generation, QR creation, queue transitions, pause/resume and API access rules.

### About the ETA

TurnAhead estimates the wait based on how many tickets are ahead and the average recent completed-service duration. It displays a **range**, not an exact arrival time; priority patients, interruptions and long consultations can change the real wait. Staff should still call or announce the next visitor.

<br/>

## Roadmap

| Milestone | Status |
|---|---|
| Walk-in ticket issue, secure QR tracking and live board | ✅ Implemented |
| Multi-department queue control | ✅ Implemented |
| Reception login and light/dark theme | ✅ Implemented |
| Basic adaptive waiting windows | ✅ Implemented |
| Booked appointments + walk-in coordination | 🗓️ Planned |
| Staff accounts, roles, audit history | 🗓️ Planned |
| SMS/WhatsApp updates via approved providers | 🗓️ Planned |
| Queue analytics, kiosk mode and accessibility audit | 🗓️ Planned |

> **Current scope:** This is an open-source walk-in pilot. It is not yet a certified clinical or enterprise system. A real organizational deployment needs security review, data-retention policy, backups, accessibility testing and operational validation. See [SECURITY.md](SECURITY.md).

<br/>

## Why I built it

TurnAhead started with a simple observation: when people don't know where they stand in a queue, they spend more time asking, checking and worrying than they should have to.

The interesting engineering challenge wasn't just drawing tickets. It was making sure a reception action, a printed QR code, a public display and someone's personal tracking page **all describe the same real state** — reliably, with as little friction as possible.

Building this project was an exercise in thoughtful product design, real-time updates, reliable backend state, and keeping complex operations easy to understand.

<br/>

## Open source, open to improvement

Issues, feedback, pilot suggestions and contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. The source is licensed under [MIT](LICENSE).

<div align="center">

---

<img src="public/assets/brand-light.webp" alt="TurnAhead logo" width="230" />

**Less waiting. More living.**

Built by [Nittin Chughani](https://github.com/NittinChughani) · Made with care for the everyday moments that add up.

[Back to top ↑](#why-turnahead)

</div>