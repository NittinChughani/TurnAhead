/** Browser API for verified hospital owners, staff invitations and per-hospital roles. */
import {
  collection, doc, getDoc, getDocs, query, where, onSnapshot,
  writeBatch, setDoc, updateDoc, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, signOut, reload
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {auth, db} from './firebase.js';
import {normalizeEmail, validHospitalName, canInviteRole, canChangeRole,
  membershipId, INVITE_DAYS} from './org-model.js';

export const observeAuth = callback => onAuthStateChanged(auth, callback);
export const login = (email,password) => signInWithEmailAndPassword(auth,normalizeEmail(email),password);
export const register = (email,password) => createUserWithEmailAndPassword(auth,normalizeEmail(email),password);
export const logout = () => signOut(auth);
export async function requestVerification(user=auth.currentUser) {
  if (!user || user.emailVerified) return;
  await sendEmailVerification(user);
}
export async function refreshVerification(user=auth.currentUser) {
  if(!user) return false;
  await reload(user);
  // Refresh the Firebase ID token so Firestore rules see email_verified=true.
  await user.getIdToken(true);
  return user.emailVerified;
}
const memberRef=(hospitalId,uid)=>doc(db,'memberships',membershipId(hospitalId,uid));
const hospitalRef=id=>doc(db,'hospitals',id);
const inviteRef=(hospitalId,email)=>doc(db,'hospitals',hospitalId,'invites',normalizeEmail(email));

export async function myMemberships(user=auth.currentUser) {
  if(!user || !user.emailVerified) return [];
  const result=await getDocs(query(collection(db,'memberships'),where('uid','==',user.uid)));
  return result.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.active);
}
export async function getHospital(id) {
  if(!/^[A-Za-z0-9]{20}$/.test(id)) throw Error('Invalid hospital workspace.');
  const snap=await getDoc(hospitalRef(id));
  if(!snap.exists() || snap.data().status!=='active') throw Error('Hospital workspace unavailable.');
  return {id:snap.id,...snap.data()};
}
export function watchMembership(hospitalId,uid,callback,error) {
  return onSnapshot(memberRef(hospitalId,uid),snap=>callback(snap.exists()?{id:snap.id,...snap.data()}:null),error);
}
// Hospital owners are provisioned through an operator-controlled process, not public signup.
// Hospital owners are provisioned through an operator-controlled process, not public signup.
export async function createHospital() {
  throw Error('Hospital workspaces are provisioned by the TurnAhead platform operator.');
}
export async function findInvitation(hospitalId,email) {
  const snap=await getDoc(inviteRef(hospitalId,email));
  if(!snap.exists()) return null;
  return {id:snap.id,...snap.data()};
}
export async function acceptInvitation(hospitalId,user=auth.currentUser) {
  if(!user?.emailVerified) throw Error('Verify your email before accepting an invitation.');
  const email=normalizeEmail(user.email), ref=inviteRef(hospitalId,email);
  const invite=await getDoc(ref);
  if(!invite.exists()||invite.data().status!=='pending'||invite.data().expiresAt.toMillis()<Date.now())
    throw Error('No active invitation was found for your verified email. Ask your administrator to resend it.');
  const data=invite.data(), batch=writeBatch(db);
  batch.set(memberRef(hospitalId,user.uid),{
    uid:user.uid,hospitalId,email,role:data.role,active:true,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp(),invitedBy:data.createdBy
  });
  batch.update(ref,{status:'accepted',acceptedUid:user.uid,acceptedAt:serverTimestamp()});
  await batch.commit();
  return await getHospital(hospitalId);
}
export async function inviteStaff(hospitalId,email,role,actorRole,user=auth.currentUser) {
  email=normalizeEmail(email);
  if(email===normalizeEmail(user.email)) throw Error('You already have an account in this workspace.');
  if(!canInviteRole(actorRole,role)) throw Error('Only the designated hospital administrator can add authorized staff.');
  const now=Date.now();
  await setDoc(inviteRef(hospitalId,email),{
    email,role,status:'pending',createdBy:user.uid,
    createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(now+INVITE_DAYS*86400000),
    acceptedUid:null,acceptedAt:null
  });
}
export async function revokeInvitation(hospitalId,email) {
  await updateDoc(inviteRef(hospitalId,email),{status:'revoked'});
}
export function watchInvitations(hospitalId,next,error) {
  return onSnapshot(collection(db,'hospitals',hospitalId,'invites'),
    snap=>next(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.email.localeCompare(b.email))),error);
}
export function watchHospitalMembers(hospitalId,next,error) {
  return onSnapshot(query(collection(db,'memberships'),where('hospitalId','==',hospitalId)),
    snap=>next(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.email.localeCompare(b.email))),error);
}
export async function updateStaff(hospitalId,member,changes,actorRole) {
  if(!canChangeRole(actorRole,member.role,changes.role??member.role)) throw Error('You cannot edit this person’s role.');
  const patch={updatedAt:serverTimestamp()};
  if('role' in changes) patch.role=changes.role;
  if('active' in changes) patch.active=Boolean(changes.active);
  await updateDoc(memberRef(hospitalId,member.uid),patch);
}
export async function renameHospital(hospitalId,name) {
  await updateDoc(hospitalRef(hospitalId),{name:validHospitalName(name),updatedAt:serverTimestamp()});
}
