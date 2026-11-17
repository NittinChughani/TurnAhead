# Optional TurnAhead background notifications — deploy only with consent and a trusted server

TurnAhead v2.5.2 adds **in-page** turn alerts on supported browsers plus an **optional, disabled-by-default** Web Push integration. The existing GitHub Pages + Firebase Spark (free) installation **does not send lock-screen notifications** while browsers are closed.

## Why the setup is optional

* Background notifications require a server to authenticate, send and revoke push messages when a queue ticket is called. A GitHub Pages page or client Firebase API key cannot securely send push messages by itself.
* The included sender lives in `functions/index.js`. **Cloud Functions for Firebase requires the Blaze billing plan**, which entails connecting a billing account and potential charges. Do not upgrade the Firebase project or deploy this backend without an explicit decision from its owner. No automated billing or deployment actions are included.
* iOS 16.4+ supports Web Push for compatible **Home Screen installed** web apps, not arbitrary Safari browser tabs. The patient must add TurnAhead to the Home Screen, open it from that icon and grant notification permission. Some devices, Focus modes, system restrictions, power management or connectivity issues can suppress or delay delivery. Neither iOS vibration nor guaranteed delivery in every condition is possible.
* Android/desktop Web Push requires compatible browser settings, explicit permission, network access and a working server. No notification is guaranteed to arrive within a strict time limit.

## Activation prerequisites (not yet configured or deployed)

1. Decide whether the organization permits Blaze billing and background notifications, and perform a privacy/security review first.
2. In the Firebase project, enable Firebase Cloud Messaging for web and generate a Web Push VAPID public key. Configure **App Check** with a reCAPTCHA v3 site key for the exact GitHub Pages origin, and verify App Check for Cloud Functions.
3. Set the two public values in `public/push-config.js`: `vapidPublicKey` and `appCheckSiteKey`. Do not commit private server keys or service-account JSON.
4. Review abuse prevention, ticket lifetime, anonymous QR-bearer access, revocation and subscription cleanup. The included endpoint enforces App Check and caps active registrations, but it has **not** undergone a production security review. Production operations may need stronger per-device throttling, token revocation, and TTL deletion policies.
5. Install dependencies in `functions/`, deploy the functions using the Firebase CLI **only after the owner agrees to billing**, and test the `registerTurnAlert` callable and `deliverCalledTurnAlert` Firestore trigger.
6. Install the website as a Home Screen app on a supported iPhone. Open the ticket page from the installed icon, tap Enable turn alerts, allow permission and check that the site reports successful push registration. Verify a locked-screen test by issuing and calling a fictional ticket.
7. Test opt-in/out, stale tokens, disconnected devices, duplicate triggers, multiple subscriptions, denial of unauthorized Firestore access, and actual delivery on Android and iOS. Until verified, explicitly describe background notifications as **experimental**.

## Patient privacy

The push payload includes **only the ticket code and a short action prompt**. It does not send the patient's name, doctor's name, diagnosis, room number, or staff identity to the lock screen. Notification click returns to the private QR tracking URL. Anyone with that URL can see visit details: patients should protect their QR links. FCM device tokens are held only in a server-managed subcollection denied to web clients by Firestore rules and retained only for a short period (cleanup policies are still required for a real deployment).

## Zero-cost mode

When `public/push-config.js` has empty keys, the patient page continues to support ordinary live updates and browser notifications **while open**, but tells the patient that lock-screen delivery is not configured. No Cloud Functions and no Firebase Storage bucket are necessary for the other v2.5.2 improvements.
