import {app} from './firebase.js';
import {turnaheadPushConfig} from './push-config.js';

/** Real background push is optional and requires an authenticated server-side sender. */
export async function registerTurnPush(hospitalId,ticketId) {
  if(!turnaheadPushConfig.vapidPublicKey||!turnaheadPushConfig.appCheckSiteKey)return {enabled:false,reason:'Lock-screen alerts are not yet configured by this hospital. Keep the queue page open for live alerts.'};
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))
    return {enabled:false,reason:'Background push is not supported in this browser.'};
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios&&!window.matchMedia('(display-mode: standalone)').matches)
    return {enabled:false,reason:'On iPhone, add TurnAhead to the Home Screen, open it there, then enable alerts. Safari tabs cannot receive background web push.'};
  if(Notification.permission!=='granted')return {enabled:false,reason:'Allow notifications in the device settings and try again.'};
  const [{getMessaging,isSupported,getToken},{getFunctions,httpsCallable},{initializeAppCheck,ReCaptchaV3Provider}]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js')
  ]);
  if(!await isSupported())return {enabled:false,reason:'Firebase web push is not available in this browser.'};
  initializeAppCheck(app,{provider:new ReCaptchaV3Provider(turnaheadPushConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:true});
  const worker=await navigator.serviceWorker.register('./push-sw.js',{scope:'./'});
  const token=await getToken(getMessaging(app),{vapidKey:turnaheadPushConfig.vapidPublicKey,serviceWorkerRegistration:worker});
  if(!token)return {enabled:false,reason:'This device did not provide a push subscription token.'};
  const response=await httpsCallable(getFunctions(app,turnaheadPushConfig.region),'registerTurnAlert')({hospitalId,ticketId,token});
  if(response.data?.ok!==true)throw Error('The notification service did not confirm this device.');
  return {enabled:true,reason:'Lock-screen alerts requested. Delivery depends on device permissions, connectivity and the push service.'};
}
