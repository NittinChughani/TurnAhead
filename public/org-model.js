/** Shared, framework-free organization rules used by the interface and tests. */
export const ROLES = Object.freeze(['owner', 'supervisor', 'receptionist']);
export const INVITABLE_ROLES = Object.freeze(['supervisor', 'receptionist']);
export const INVITE_DAYS = 7;

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)) throw Error('Enter a valid staff email address.');
  return email;
}
export function validHospitalName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 3 || clean.length > 70) throw Error('Organization name must be 3–70 characters.');
  return clean;
}
// One designated hospital owner/administrator. Supervisor is operational, not administrative.
// One designated hospital owner/administrator. Supervisor is operational, not administrative.
export function canManageStaff(role) { return role === 'owner'; }
export function canManageDepartments(role) { return role === 'owner' || role === 'supervisor'; }
export function canInviteRole(actorRole, inviteRole) {
  return actorRole === 'owner' && INVITABLE_ROLES.includes(inviteRole);
}
export function canChangeRole(actorRole, subjectRole, desiredRole) {
  // Existing v2.1 secondary admins may be downgraded, never newly assigned.
  return actorRole === 'owner' && subjectRole !== 'owner' && INVITABLE_ROLES.includes(desiredRole);
}
export function isStaffRole(role) { return role === 'supervisor' || role === 'receptionist'; }
export function membershipId(hospitalId, uid) {
  if (!/^[A-Za-z0-9]{20}$/.test(hospitalId) || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('Invalid workspace or user ID.');
  return `${hospitalId}_${uid}`;
}
export function boardLink(hospitalId, baseUrl) {
  const url = new URL('./board.html', baseUrl);
  url.searchParams.set('hospital', hospitalId);
  return url.toString();
}
export function invitationLink(hospitalId, baseUrl) {
  const url = new URL('./activate.html', baseUrl);
  url.searchParams.set('invite', hospitalId);
  return url.toString();
}
export function ticketLink(hospitalId, ticketId, baseUrl) {
  const url = new URL('./track.html', baseUrl);
  url.searchParams.set('hospital', hospitalId);
  url.searchParams.set('ticket', ticketId);
  return url.toString();
}
