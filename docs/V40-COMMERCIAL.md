# TurnAhead v4.0 commercial development candidate

Development branch only. The public MIT license remains intact. No owner dashboard in this repository. Live v3.3.3 and production Firebase must remain unchanged until joint release review.

## Commercial contract

- Essential: PKR 4,999 monthly / 49,990 annual; setup 15,000; 2 departments, 5 doctors, 3 non-owner staff accounts.
- Professional: PKR 14,999 monthly / 149,990 annual; setup 35,000; 15 departments, 50 doctors, 30 non-owner staff accounts.
- Enterprise: negotiated amounts and per-workspace integer limits. Multi-location agreement uses separately provisioned workspaces; a single multi-location dashboard is not implemented.
- Patient access and demo free. No payment gateway or automatic charges. Setup only on initial order. Discount and tax amounts explicitly recorded in integer PKR. Issuer/tax details need authorized business review.
- Verified email required for intake; one lead per UID; one open request per organization and kind. Resolved requests are archived and pending slot released. Contact information is private; never include patient data or payment credentials.
- Existing unassigned organizations remain fully operational. Managed accounts reserve permanent capacity atomically on department, doctor and accepted staff creation. Inactive entries consume capacity; pending invitations do not reserve slots. No automatic deletion or lockout of clinical workflows.
- 15-day grace period for premium reports. Expired or cancelled subscriptions stop managed capacity expansion and advanced reports, not ongoing clinical services or record access. Raw attendance records remain owner-readable for continuity; open-source clients can independently calculate statistics.
- New organizations provision only after verified payment and a verified pending lead; existing ones migrate without deletion. Renewals extend from later of current expiry or current date; new plan changes apply only after the previous term ends. No automatic proration or refunds.

## Trusted service and TCC integration

`functions/commercial-endpoints.js` exports callable `commercialOperator` (requires verified email, server-assigned custom claim turnaheadPlatformOperator, live Auth account/claim and App Check) and `commercialAnalytics` (verified hospital owner, current managed Professional/Enterprise entitlement; never grants platform operator clinical access). `commercialRenewalSweep` is an optional daily scheduled function at 08:00 PKT; it creates idempotent notices for 30/7/1-day windows, grace and expiry. It does not send email/SMS; admin overview displays current renewal warning independently of the scheduler.

Callable operator actions:
- issue: orderId and hospitalId (20 alphanumeric chars each), ownerUid, kind initial/renew/change, plan, cycle, billTo, issuer, taxId, optional discount/tax, Enterprise custom {recurringAmount,setupAmount,limits}. One outstanding order per hospital and per unprovisioned lead. New workspaces must have a matching verified pending lead.
- verifyPayment: orderId, exact amount, non-sensitive external payment reference. Manual operator attestation, NOT automatic bank verification. Duplicate order payment, reused normalized payment reference and incorrect amounts rejected.
- activate: orderId, after verified payment. Server-side transaction provisions or migrates, initializes limits/counters, bumps revision, sets expiry and writes audit. Migration lock blocks expansion only; releases after completion/failure. If a process crashes leaving a lock, authorized operator must reconcile the order and verify no job is running before manual recovery. Never remove a commercial account as a suspension mechanism.
- voidOrder: orderId, unpaid order only. Paid refunds/reconciliation require a separate approved workflow.
- resolveRequest: hospitalId, kind, status resolved/declined, note. Archives request and allows resubmission.
- cancel: hospitalId, reason; no outstanding order; retains data and existing patient service.
Operator action errors are sanitized. No credentials in browser or public repository. No calls to production made.

### Firestore records

`commercialLeads/{uid}` verified self-create, own/operator read; trusted decisions only.
`commercialAccounts/{hid}` owner/operator read; trusted writes only. plan, cycle, status, recurringAmount, limits, activatedAt, expiresAt, revision.
Subcollections invoices, payments, notices, requestHistory: owner/operator read, no client writes.
requests/{kind}: owner creates pending request, same tenant owner/operator reads; server resolves.
`commercialOrders` and `commercialAudit`: operator read, trusted writes only. Migration locks, order slots, lead slots and hashed payment-reference reservations are entirely server-only.
`hospitals/{hid}/capacity/managed`: trusted initialized counts and limits, client only atomic increment linked to creation of corresponding resource. Expansion denied during migration or when managed account is not active/unexpired.
Customer JSON export covers latest 100 commercial records of each displayed category (not a full clinical export); owners can request a complete export. Existing patient record exports unaffected.

## Testing and integration gates

- CI quality, browser, rules emulator and Admin SDK service emulator tests with fictional records; no real credentials or actual payment. Policy/analytics parity tests ensure server copies match browser logic.
- TCC must still be built separately, configure App Check, trusted owner claims and deploy matching Functions only with explicit hosting/billing approval. Firebase Functions and scheduler may require Blaze billing; evaluate alternative hosting first. No paid services enabled.
- Production Auth / callable / App Check / scheduled delivery and joint browser workflow not verified by emulator service tests. Verify in nonproduction project before merge. Anti-abuse, quota/load, backup/restore, legal/privacy review, tax/retention policy, provider arrangements and authorized business payment procedures required before real commercial use.
- Operator service is not an external payment processor. Full clinical export, paid refund reconciliation, automatic email/SMS, multi-location orchestration and enterprise integrations require separately approved scope. Legacy bearer ticket URLs require privacy/security review.
- Deploy matching rules only at final integration, with backup, compatibility check, safe migration and live fictional-data smoke tests. Never expose Admin SDK keys or use actual patient data during testing.
