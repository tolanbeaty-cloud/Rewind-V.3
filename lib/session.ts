import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
export type Sess = { access?: string; refresh?: string; exp?: number; verifier?: string; state?: string };
const key = () => new Uint8Array(Buffer.from(process.env.SESSION_SECRET!, 'base64'));
// Tokens live only in an encrypted, httpOnly cookie. Never exposed to client JS, never logged.
export async function getSession(): Promise<Sess> {
  const c = (await cookies()).get('rw');
  if (!c) return {};
  try { return (await jwtDecrypt(c.value, key())).payload as Sess; } catch { return {}; }
}
export async function setSession(s: Sess) {
  const jwt = await new EncryptJWT(s as any).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setExpirationTime('30d').encrypt(key());
  (await cookies()).set('rw', jwt, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 2592000 });
}
export async function clearSession() { (await cookies()).delete('rw'); }
