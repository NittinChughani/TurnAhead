import {collection,doc,query,orderBy,limit,getDocsFromServer,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {auth,db} from './firebase.js';
/** Minimal immutable operational event. No names, emails, notes, ticket links or clinical data. */
export function appendActivity(writer,hid,kind){
 const actorUid=auth.currentUser?.uid;if(!actorUid)throw Error('Sign in before recording an operation.');
 writer.set(doc(collection(db,'hospitals',hid,'activity')),{actorUid,kind,createdAt:serverTimestamp()});
}
export async function readActivity(hid){
 const snap=await getDocsFromServer(query(collection(db,'hospitals',hid,'activity'),orderBy('createdAt','desc'),limit(100)));
 return snap.docs.map(d=>d.data());
}
