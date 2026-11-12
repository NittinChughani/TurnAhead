/** Shared, framework-free organization rules used by the interface and tests. */
export const ROLES = Object.freeze(['owner', 'admin', 'supervisor', 'receptionist']);
export const INVITABLE_ROLES = Object.freeze(['admin', 'supervisor', 'receptionist']);
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
export function canManageStaff(role) { return role === 'owner' || role === 'admin'; }
export function canManageDepartments(role) { return canManageStaff(role) || role === 'supervisor'; }
export function canInviteRole(actorRole, inviteRole) {
  return canManageStaff(actorRole) && INVITABLE_ROLES.includes(inviteRole) && (inviteRole !== 'admin' || actorRole === 'owner');
}
export function canChangeRole(actorRole, subjectRole, desiredRole) {
  return canManageStaff(actorRole) && subjectRole !== 'owner' &&
    INVITABLE_ROLES.includes(desiredRole) && (actorRole === 'owner' || (subjectRole !== 'admin' && desiredRole !== 'admin'));
}
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
  const url = new URL('./desk.html', baseUrl);
  url.searchParams.set('invite', hospitalId);
  return url.toString();
}
export function ticketLink(hospitalId, ticketId, baseUrl) {
  const url = new URL('./track.html', baseUrl);
  url.searchParams.set('hospital', hospitalId);
  url.searchParams.set('ticket', ticketId);
  return url.toString();
}
