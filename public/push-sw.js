/* Push-only worker: NEVER cache private QR pages or patient data. */
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey:'AIzaSyBQU1xHc6o92ZD02HOgTrh_Fe6UXm0O7ko',
  authDomain:'turnahead-staging.firebaseapp.com',
  projectId:'turnahead-staging',
  appId:'1:528112784622:web:7a2dababac531e0a254fff'
});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
  const data=payload.data||{};
  if(data.kind!=='turn-called'||!/^[A-Z]{3}-\d{3,6}$/.test(data.code||''))return;
  // No names, diagnoses, doctor names or other patient information on lock screens.
  const url=new URL('./track.html',self.registration.scope);
  if(data.hospital&&/^[A-Za-z0-9]{20}$/.test(data.hospital))url.searchParams.set('hospital',data.hospital);
  if(data.ticket&&/^[A-Za-z0-9]{20}$/.test(data.ticket))url.searchParams.set('ticket',data.ticket);
  return self.registration.showNotification('TurnAhead · Your turn is ready',{
    body:`Ticket ${data.code} has been called. Please return to reception.`,
    icon:'./assets/favicon.png',badge:'./assets/favicon.png',
    tag:`ta-called-${data.ticket||''}`,renotify:true,data:{url:url.href}
  });
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const u=event.notification?.data?.url;
  if(!u)return;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async pages=>{
    const matched=pages.find(p=>p.url===u);
    if(matched)return matched.focus();
    return clients.openWindow(u);
  }));
});
