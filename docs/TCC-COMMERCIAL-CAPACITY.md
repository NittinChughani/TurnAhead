# Managed commercial capacity — staging release candidate

- Applies only to hospitals with an operator-created `commercialPolicy/current` document. Existing unmanaged hospitals retain their existing behavior.
- Caps **new allocations only**: department documents, doctor documents and non-owner staff memberships. Existing queue processing, ticket issuance and completion, existing staff access, changes to existing doctors/departments, archives and patient-facing reads are never gated by commercial status.
- Allocated slots count all retained records, including inactive doctors and disabled staff. Reactivation does not create a new seat. This conservative model prevents bypass and preserves history; a future audited reclamation process is separate.
- The operator must initialize `commercialUsage/{departments,doctors,staff}` from a verified inventory or atomically with a brand-new operational hospital. Do not seed existing hospitals with zero.
- The immutable policy includes `expansionAllowed`, `validUntil` (Firestore timestamp), and `limits` with integer counts or null (unlimited). Browser users cannot modify policy. Rules require each new resource and its counter increment to commit atomically; a counter cannot be advanced without a matching new resource.
- Google login is available for verified, provisioned operational accounts. Existing password sign-in and membership authorization are preserved. Google provider must be enabled for the staging project.
- This PR is not a production deployment. Run the isolated rules emulator and browser tests, then deploy the full operational app/rules to a separate staging environment before enabling any TCC write features. Retain previous rules and app artifacts for rollback.
