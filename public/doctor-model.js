/** Pure, browser-independent doctor and room input validation. */
export function cleanDoctorName(name){
  const value=String(name||'').trim().replace(/\s+/g,' ');
  if(value.length<2||value.length>80)throw Error('Doctor name must be 2–80 characters.');
  return value;
}
export function cleanRoomNumber(room,{required=false}={}){
  const value=String(room||'').trim();
  if(!value&&!required)return '';
  if(!/^[A-Za-z0-9][A-Za-z0-9 .\-\/]{0,19}$/.test(value))throw Error('Room number must be 1–20 characters (letters, numbers, spaces, dot, slash or dash).');
  return value;
}
export function doctorAvailable(doctor,departmentId){
  return Boolean(doctor?.active&&doctor.departmentId===departmentId);
}
