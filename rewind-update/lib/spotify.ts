import { getSession, setSession } from './session';
const API = 'https://api.spotify.com/v1';
export const SCOPES = 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-library-modify';
async function token(): Promise<string | null> {
  const s = await getSession();
  if (!s.access || !s.refresh) return null;
  if (Date.now() < (s.exp ?? 0) - 60_000) return s.access;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh, client_id: process.env.SPOTIFY_CLIENT_ID! }) });
  if (!r.ok) return null;
  const j = await r.json();
  await setSession({ access: j.access_token, refresh: j.refresh_token ?? s.refresh, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}
export async function sp(path: string, init: RequestInit = {}) {
  const t = await token();
  if (!t) return Response.json({ error: 'Not connected' }, { status: 401 });
  const r = await fetch(API + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } });
  if (r.status === 429) { const ra = Number(r.headers.get('Retry-After') ?? 3); return Response.json({ error: 'Spotify rate limit hit. Try again in a moment.', retryAfter: ra }, { status: 429, headers: { 'Retry-After': String(ra) } }); }
  if (r.status === 403) return Response.json({ error: 'Spotify refused this request (403). In Development Mode your account must be on the app allowlist and the app owner needs Premium.' }, { status: 403 });
  return r;
}
