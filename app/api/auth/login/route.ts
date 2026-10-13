import { createHash, randomBytes } from 'crypto';
import { setSession } from '@/lib/session';
import { SCOPES } from '@/lib/spotify';
import { redirect } from 'next/navigation';
export async function GET() {
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(16).toString('hex');
  await setSession({ verifier, state });
  const q = new URLSearchParams({ response_type: 'code', client_id: process.env.SPOTIFY_CLIENT_ID!, scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!, state, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url') });
  redirect('https://accounts.spotify.com/authorize?' + q);
}
