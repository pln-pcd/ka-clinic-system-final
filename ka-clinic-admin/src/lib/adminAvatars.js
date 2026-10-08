// Admin profile photos: adminAvatars/{uid} = { dataUrl, updatedAt }.
// Kept apart from admins/{uid} (same idea as patientAvatars) so the admin
// list and role checks never download photos. Each admin can write only their
// own photo (firestore.rules adminAvatars); every active admin can read them.
import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db, listen } from './firebase.js';

export const ADMIN_AVATAR_MAX_BYTES = 600 * 1024;

/** One admin's photo (data URL) or '' — live. */
export function useAdminAvatar(uid) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!uid) { setSrc(''); return undefined; }
    return listen(doc(db, 'adminAvatars', uid),
      snap => setSrc(snap.exists() ? (snap.data().dataUrl || '') : ''),
      () => setSrc(''));
  }, [uid]);
  return src;
}

/** Every admin's photo, as { [uid]: dataUrl } — live. */
export function useAdminAvatars() {
  const [map, setMap] = useState({});
  useEffect(() => listen(collection(db, 'adminAvatars'),
    snap => setMap(Object.fromEntries(snap.docs.map(d => [d.id, d.data().dataUrl || '']))),
    () => setMap({})), []);
  return map;
}

const dataUrlBytes = (url) => Math.ceil(((url.split(',')[1] || '').length * 3) / 4);

/**
 * A cropped photo (square canvas from ImageCropModal) as a JPEG data URL
 * under ADMIN_AVATAR_MAX_BYTES: lowers the quality first, then the size.
 */
export function compressCanvas(source) {
  let size = Math.min(512, source.width);
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, size, size);
    for (const q of [0.86, 0.76, 0.66, 0.56]) {
      const out = canvas.toDataURL('image/jpeg', q);
      if (dataUrlBytes(out) <= ADMIN_AVATAR_MAX_BYTES) return out;
    }
    size = Math.round(size * 0.75);
  }
  throw new Error('That image is too large to use as a profile photo.');
}

export function saveAdminAvatar(uid, dataUrl) {
  return setDoc(doc(db, 'adminAvatars', uid), { dataUrl, updatedAt: Date.now() });
}

export function removeAdminAvatar(uid) {
  return deleteDoc(doc(db, 'adminAvatars', uid));
}
