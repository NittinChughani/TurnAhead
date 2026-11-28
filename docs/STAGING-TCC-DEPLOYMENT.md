# Isolated TurnAhead staging deployment

This is a staging-only branch, not a production merge candidate. The public Firebase config and push-worker config target **turnahead-staging**. The build refuses production project references; optional push remains disabled; each HTML page displays a staging warning. The existing Pages workflow only deploys main automatically.

## Browser-only operator activation

The GitHub workflow "TurnAhead isolated TCC staging" builds and uploads a verified static artifact without requiring a secret. To actually publish Hosting and Firestore rules, an account owner must authorize deployment:

1. In the existing turnahead-staging project, enable Firebase Hosting's default site if it is not already initialized. Do not upgrade the billing plan.
2. Create a dedicated staging-only deployment service account with Firebase Hosting Admin and Firebase Rules Admin permissions and the project read permissions required for CLI deployment. Do not grant Owner or Editor, and do not reuse the TCC runtime service account. Store its JSON key directly as the GitHub Actions environment secret STAGING_FIREBASE_DEPLOY_KEY under the turnahead-staging environment. Restrict that environment to the staging/tcc-v1 branch. Never send the private key in chat or commit it.
3. Re-run the staging branch's latest "TurnAhead isolated TCC staging" push workflow, not the production Pages workflow. The job checks the credential's project ID, explicitly deploys only hosting and rules to turnahead-staging, then verifies the hosted public config. A run with a missing credential builds the artifact but does not deploy.
4. Expected hosting address after successful deployment: https://turnahead-staging.web.app/ . The public app must show STAGING ONLY. Check Authentication authorized domains for this host.

## Operational verification

The TCC worker's operational provisioning, automatic sync and managed policy publication still require their separate staging-only runtime credentials. The deployment key is not a runtime credential. Keep every optional feature disabled until authorized. The synthetic staging hospital ID created before this release is not a valid operational workspace ID; create a new approved synthetic application via the new provisioning flow instead of changing existing commercial IDs. Verify using synthetic patients only. No production merge or rules publication is part of this workflow.

No production backup or live integration is implied by this build. Same-database recovery snapshots do not replace offsite backup.

## Activation

Deployment authorization configured by the project operator; trigger the staging-only workflow. The workflow independently checks the credential and verifies the hosted configuration before reporting success.
