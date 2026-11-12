# Security & privacy

TurnAhead is an **early-stage pilot**, not a clinically validated or audited hospital information system.

- **Never store diagnoses or medical records in ticket metadata.** The MVP deliberately issues anonymous queue numbers.
- Patient tracking links contain random, unguessable identifiers. Anyone possessing a ticket or link can access its queue status. Treat printed receipts as private.
- Reception actions require a server-side session issued after password authentication. Session cookies are HTTP-only and use `Secure` in production (deploy behind HTTPS).
- Set strong unique `ADMIN_PASSWORD` and `SESSION_SECRET` values in environment variables; never commit `.env`.
- Run **one instance per facility**. The current SSE hub is in-process; adding horizontally scaled replicas requires a shared event bus and shared database.
- Place the SQLite file on a persistent, backed-up volume. Ephemeral cloud filesystems lose data on redeploy.
- Ticket data is retained until an administrator handles database retention/deletion; implement a formal retention and audit policy before a real clinical rollout.
- Restrict reception device access and rotate passwords. A shared password is appropriate for demos and small pilots, but real deployments should introduce individual staff accounts, audit logs and permission roles.
- Browser notifications require HTTPS or localhost and work while the tracking page is open. This is not an SMS, WhatsApp or background push service.

If you find a security issue, please contact the maintainer privately through GitHub rather than publishing exploit details in an issue.