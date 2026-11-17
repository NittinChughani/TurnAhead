/** Optional push service. Leave blank on the zero-cost GitHub Pages/Spark deployment.
 *  To enable lock-screen push: deploy the protected Firebase Cloud Functions,
 *  set a Firebase Messaging Web Push VAPID public key and run live device tests.
 */
export const turnaheadPushConfig = {
  vapidPublicKey: '',
  appCheckSiteKey: '',
  region: 'us-central1'
};
