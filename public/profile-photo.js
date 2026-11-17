/** Small, private membership avatars: no Storage bucket or public image URLs. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_DATA_LENGTH = 65000;
export function validProfilePhoto(value) {
  return value === '' || (typeof value === 'string' && value.length <= MAX_PHOTO_DATA_LENGTH &&
    /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
}
export function initials(name='') {
  const words=String(name).trim().split(/\s+/).filter(Boolean);
  return (words.length>1 ? words[0][0]+words.at(-1)[0] : words[0]?.slice(0,2) || '?').toUpperCase();
}
export function avatarHTML(member,esc,classes='') {
  const name=member?.displayName||member?.email||'Staff';
  const img=validProfilePhoto(member?.profilePhoto)&&member.profilePhoto ?
    `<img src="${esc(member.profilePhoto)}" alt="" loading="lazy" decoding="async">` : `<span aria-hidden="true">${esc(initials(name))}</span>`;
  return `<span class="member-avatar ${classes}" aria-hidden="true">${img}</span>`;
}
export async function compressProfilePhoto(file) {
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type))
    throw Error('Select a JPG, PNG or WebP photo. Animated and SVG images are not accepted.');
  if(file.size>MAX_PHOTO_BYTES)throw Error('Please choose an image smaller than 5 MB.');
  const url=URL.createObjectURL(file);
  try{
    const picture=new Image();
    picture.src=url;
    await picture.decode();
    if(!picture.naturalWidth||!picture.naturalHeight)throw Error('The chosen image is not readable.');
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=160;
    const ctx=canvas.getContext('2d');
    const edge=Math.min(picture.naturalWidth,picture.naturalHeight);
    ctx.drawImage(picture,(picture.naturalWidth-edge)/2,(picture.naturalHeight-edge)/2,edge,edge,0,0,160,160);
    let result='';
    for(const q of [.78,.6,.42,.25]) {
      result=canvas.toDataURL('image/webp',q);
      if(result.startsWith('data:image/webp;')&&validProfilePhoto(result))return result;
    }
    result=canvas.toDataURL('image/jpeg',.4);
    if(!validProfilePhoto(result))throw Error('This image cannot be compressed safely. Try a different photo.');
    return result;
  }finally{URL.revokeObjectURL(url);}
}

export function avatarContents(member,esc) {
  return avatarHTML(member,esc).replace(/^<span[^>]*>/,'').replace(/<\/span>$/,'');
}
