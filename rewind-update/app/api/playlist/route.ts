import { sp } from '@/lib/spotify';
const bad = (m: string) => Response.json({ error: m }, { status: 400 });
const okId = (s: string | null) => !!s && /^[A-Za-z0-9]+$/.test(s);
const trackId = (u: string) => u.split(':')[2];
// id === 'liked' means the user's Liked Songs (library), otherwise a playlist id.
// GET ?id=&offset= -> one page of tracks
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams; const id = q.get('id');
  if (!okId(id)) return bad('Bad playlist id');
  const off = Number(q.get('offset') ?? 0);
  if (id === 'liked') {
    const r = await sp(`/me/tracks?limit=50&offset=${off}`);
    if (!r.ok) return r;
    const j = await r.json();
    const items = (j.items ?? []).filter((x: any) => x.track?.uri).map((x: any) => ({
      uri: x.track.uri, title: x.track.name, artists: (x.track.artists ?? []).map((a: any) => a.name),
      album: x.track.album?.name ?? '', img: x.track.album?.images?.[1]?.url ?? null, added: x.added_at, local: false }));
    return Response.json({ total: j.total, items, step: (j.items ?? []).length });
  }
  const r = await sp(`/playlists/${id}/items?limit=50&offset=${off}&additional_types=track`);
  if (!r.ok) return r;
  const j = await r.json();
  const items = (j.items ?? []).map((x: any) => x.item ?? x.track).map((t: any, n: number) => t && t.uri && t.type !== 'episode' ? ({
    uri: t.uri, title: t.name, artists: (t.artists ?? []).map((a: any) => a.name), album: t.album?.name ?? '',
    img: t.album?.images?.[1]?.url ?? null, added: j.items[n].added_at, local: !!t.is_local }) : null).filter(Boolean);
  return Response.json({ total: j.total, items, step: (j.items ?? []).length });
}
// POST {id, action:'remove'|'restore', uris[]}
export async function POST(req: Request) {
  const { id, action, uris } = await req.json();
  if (!okId(id) || !Array.isArray(uris) || !['remove', 'restore'].includes(action)) return bad('Bad request');
  const liked = id === 'liked'; const size = liked ? 40 : 100;
  for (let i = 0; i < uris.length; i += size) {
    const b: string[] = uris.slice(i, i + size);
    const r = liked
      ? await sp(`/me/library?uris=${encodeURIComponent(b.join(','))}`, { method: action === 'remove' ? 'DELETE' : 'PUT' })
      : await sp(`/playlists/${id}/items`, action === 'remove'
        ? { method: 'DELETE', body: JSON.stringify({ items: b.map((uri) => ({ uri })) }) }
        : { method: 'POST', body: JSON.stringify({ uris: b }) });
    if (!r.ok) {
      const ra = r.status === 429 ? Number(r.headers.get('Retry-After') ?? 3) : undefined; let detail = '';
      try { const e = await r.json(); detail = typeof e.error === 'string' ? e.error : e.error?.message ?? ''; } catch {}
      return Response.json({ error: detail || `Spotify error ${r.status}.`, retryAfter: ra }, { status: r.status });
    }
  }
  return Response.json({ ok: true, count: uris.length });
}
