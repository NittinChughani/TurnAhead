# Get TurnAhead live — no Node.js setup on your computer

You can launch the existing TurnAhead code on a public HTTPS address from your browser. Receptionists and visitors **only need the website** after deployment.

## One-click public preview (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/NittinChughani/TurnAhead)

1. Open **[Deploy TurnAhead to Render](https://render.com/deploy?repo=https://github.com/NittinChughani/TurnAhead)** and sign into Render. Authorize its access to the public TurnAhead repository if requested.
2. Review the prefilled `render.yaml` blueprint. Set your own **ADMIN_PASSWORD** (at least 12 characters). Keep it private. Render generates the session secret automatically.
3. Confirm deployment and open the `https://...onrender.com` URL Render displays. The exact address is assigned by Render; **don't guess it**.
4. On the live site, choose **Reception login**, enter your password, and issue a walk-in ticket.
5. Scan the printed QR code on a second device. **Call next** on reception and watch the patient page and `/board` update.

**No npm, terminal, or code editing is needed to use the hosted site.** The server technology runs on the hosting provider, not on your device. The frontend includes a responsive light/dark switch and the same TurnAhead logo across every screen.

## Important: free preview versus real clinic

The default Blueprint uses a free Render web service so you can try the whole app without agreeing to paid compute. Render's free web services **sleep when idle, can restart, and have ephemeral storage**. Because TurnAhead's database uses SQLite, **tickets and queues can be lost** when a free service restarts, redeploys, or sleeps. That's fine for a demo, **not** for issuing tickets to real patients. The first request after sleep might be slow, and real-time events disconnect while sleeping. Treat this as a prototype for showing the concept.

**For a real organization**, move to a paid persistent deployment, add a persistent disk at `/var/data`, and set `DATA_DIR=/var/data` on the web service. This needs a plan that supports persistent disks, suitable backups, an uptime/monitoring plan, an administration security review, and real pilot validation. The paid-plan cost is controlled by Render and is not included in this project. Don't switch `DATA_DIR` on a service with existing data without migrating it first.

If you'd rather use a custom domain, set `PUBLIC_URL=https://your-domain` after configuring HTTPS on the host; this value is used for ticket QR links. Without it, TurnAhead automatically uses Render's HTTPS URL.

## Project links after deploying

| Destination | Link |
| --- | --- |
| Visitor landing page | `/` |
| Reception desk | `/desk` |
| Public queue board | `/board` |
| Ticket tracking | Unique `/track/<token>` URL printed on the QR slip |

A published GitHub repository is **not** a running website. GitHub Pages can host static files but cannot run TurnAhead's server-side ticket generation, queue logic, SQLite database, or real-time updates. Keep the full stack on a web service.

### Troubleshooting

- **No website yet?** Deployment isn't complete until Render gives you a URL and reports the service live. A GitHub commit alone does not deploy the site.
- **Reception login fails?** Use the password entered as `ADMIN_PASSWORD` in the Render setup, not a GitHub account password.
- **Expired QR links after a restart?** This is a limitation of the free preview's ephemeral storage. Use persistent hosting for ongoing real-world queues.
- **QR shows the wrong address?** Set `PUBLIC_URL` to the final HTTPS origin, or allow Render's built-in `RENDER_EXTERNAL_URL` to be used automatically.
- **A deploy fails?** Check your Render service's deployment logs and confirm Node 22.13+ is selected.