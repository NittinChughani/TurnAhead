# TurnAhead v4.0 commercial development candidate

This branch preserves the MIT license and existing clinical workflow. It is not a deployed commercial release. No owner dashboard belongs in this repository.

## Commercial contract

- Essential: PKR 4,999 monthly / 49,990 annual; setup 15,000; 2 departments, 5 doctors, 3 non-owner staff accounts.
- Professional: PKR 14,999 monthly / 149,990 annual; setup 35,000; 15 departments, 50 doctors, 30 non-owner staff accounts.
- Enterprise: custom quote. All prices before applicable taxes.
- Patient access and demo remain free; no payment gateway or automatic charges.
- Verified email required for lead requests. One lead per UID; one request per organization and request kind. Trusted operator workflow must archive/resolve these before resubmission.
- Existing organization without commercial account remains unassigned and operational. Missing or unreadable billing data must not block clinical workflows.
- Subscription lifecycle is derived for display; 15-day grace period. No automatic suspension or deletion.

## Firestore contract for the independent Control Center

`commercialLeads/{uid}`: verified user creates once, only self and verified platform operator can read. Operator decisions require trusted backend.
`commercialAccounts/{hid}`: private owner/platform-operator readable record with plan, cycle, status, recurringAmount (integer PKR), activatedAt, expiresAt (timestamps). Clients cannot write.
`commercialAccounts/{hid}/requests/{kind}`: verified organization owner creates once, same tenant owner and platform operator read. Trusted service resolves/archives.
`commercialAccounts/{hid}/invoices/{invoiceId}`: owner/operator read only, trusted writer assigns number, total, status (issued/paid/void), issuedAt, billTo, description. Do not store payment credentials or patient data.
The boolean custom claim turnaheadPlatformOperator must be set exclusively using trusted Firebase Admin credentials. Claim alone grants commercial read access, not write access or access to private patient collections.
All provisioning, approval, invoices, payment verification and operator activity logs require trusted server-side implementation; never embed Admin SDK credentials in browser or public GitHub.

## Remaining release blockers

- Atomic capacity reservations are implemented for department, doctor and accepted staff-account creation; pending invites do not reserve capacity. Before activating a managed account, the trusted operator must provision and reconcile counters, test concurrency, and handle over-limit legacy tenants. Inactive records occupy permanent slots. Existing clinical actions are not restricted by billing.
- Feature-level backend enforcement, reliable renewals/notifications, trusted commercial write service, formal invoice issuer/tax fields, audit logs, retention and cancellation/export workflows.
- Enterprise limits and multi-location infrastructure not implemented.
- Complete browser tests, emulator rules tests, regression checks and joint Control Center integration; no production rules changes or merge before verification.
- Existing named QR tickets are bearer-secret links; commercial launch requires privacy/security and hosting capacity review.
- One verified lead per account mitigates repeat submissions but does not prevent account farming; production anti-abuse and data retention review required.
- No real payments until authorized business arrangements and appropriate review.

## Managed capacity migration contract

Trusted operator must pause resource provisioning during migration and atomically initialize the commercial account and `hospitals/{hid}/capacity/managed` record: `departments`, `doctors`, `staff` integer counts (all retained docs, staff excludes owner), `limits` map with those same three integer keys, `lastKind` and `lastId` empty strings, `updatedAt` server timestamp. Limits must match the agreed plan. No client can create or delete this record, change limits, or reset counts. Resource creation requires an atomic counter increment linked to the new record ID. Expired/paused subscriptions cannot expand capacity but existing queues, records and basic operations remain available. Missing commercial account is legacy-unassigned; managed account without counters fails closed on resource creation. Trusted backend must never delete a commercial account as a suspension mechanism.
