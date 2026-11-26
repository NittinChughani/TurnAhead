# v3.3 development candidate (not a release)

No Vercel configuration, production deployment, live rules publication or billing change. No real patient data used.

Implemented: feature showcase and homepage CTAs; grouped analytics and branded paginated PDF; isolated in-memory demo; web manifest and network-only service worker; searchable help, privacy/terms drafts, about, structured bug issue drafts; device/site status checks; wider wait estimates for small samples, preset doctor delay notices, accessible progress and print/save patient QR; feedback and bounded rechecks; atomic waiting-ticket correction and same-department transfer with private audit; filters on loaded archive pages, setup checklist navigation and reception quick guide.

Pending: cross-department transfer requires archive and sequence migration; full administrative audit log, archive-wide filters, full staff wizard, global status, quota/load measurements and authenticated real-device acceptance. Legacy permissions still expire December 12, 2026; verify old clients before removing. Privacy and terms require operator/legal review. Browser tests cover simulation and public pages, not authenticated hospital workflows.

Run quality, emulator and browser workflows. Do not publish rules before testing in a synthetic staging project. Do not merge until rule and frontend changes are coordinated. No production readiness or uninterrupted service guarantee.
