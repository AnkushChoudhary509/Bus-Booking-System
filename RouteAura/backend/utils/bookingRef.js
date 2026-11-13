import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters

/** e.g. RA-7KQ2M9XD. Uniqueness is guaranteed by a unique DB index; callers retry on collision. */
export function generateBookingRef() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `RA-${out}`;
}

export const generateQrToken = () => crypto.randomBytes(24).toString('hex');
