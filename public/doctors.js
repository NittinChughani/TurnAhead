import {collection,doc,addDoc,updateDoc,onSnapshot,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {db} from './firebase.js';
import {cleanDoctorName,cleanRoomNumber} from './doctor-model.js';
const root=hid=>collection(db,'hospitals',hid,'doctors');
export function watchDoctors(hid,next,error){
  return onSnapshot(root(hid),snap=>next(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.name.localeCompare(b.name))),error);
}
export async function addDoctor(hid,{name,departmentId,departmentName,roomNumber}){
  if(!departmentId||!departmentName)throw Error('Select a department for this doctor.');
  return addDoc(root(hid),{name:cleanDoctorName(name),departmentId,departmentName,roomNumber:cleanRoomNumber(roomNumber),active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
}
export async function changeDoctor(hid,id,{name,departmentId,departmentName,roomNumber,active}){
  if(!id||!departmentId||!departmentName)throw Error('Doctor or department is missing.');
  // Existing lane tickets reference this immutable doctor/department binding.
  // To transfer departments, deactivate the old doctor entry and create another.
  const {getDoc}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
  const old=await getDoc(doc(root(hid),id));
  if(!old.exists()||old.data().departmentId!==departmentId)
    throw Error('Doctor department cannot be changed while historical queue tickets reference it. Deactivate this entry and add a new doctor in the new department.');
  await updateDoc(doc(root(hid),id),{name:cleanDoctorName(name),departmentId,departmentName,roomNumber:cleanRoomNumber(roomNumber),active:Boolean(active),updatedAt:serverTimestamp()});
}
