import { getSession, setSession } from '@/lib/session';
import { redirect } from 'next/navigation';
export async function GET(req: Request) {
  const u = new URL(req.url); const s = await getSession();
  if (!s.verifier || u.searchParams.get('state') !== s.state || !u.searchParams.get('code')) redirect('/?error=auth');
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: u.searchParams.get('code')!,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!, client_id: process.env.SPOTIFY_CLIENT_ID!, code_verifier: s.verifier! }) });
  if (!r.ok) redirect('/?error=token');
  const j = await r.json();
  await setSession({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + j.expires_in * 1000 });
  redirect('/');
}
