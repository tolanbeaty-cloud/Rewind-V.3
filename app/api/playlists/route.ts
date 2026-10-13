import { sp } from '@/lib/spotify';
// Lists playlists the user can actually edit (owned or collaborative).
export async function GET() {
  const me = await sp('/me'); if (!me.ok) return me;
  const myId = (await me.json()).id; const out: any[] = [];
  for (let off = 0; ; off += 50) {
    const r = await sp(`/me/playlists?limit=50&offset=${off}`); if (!r.ok) return r;
    const j = await r.json();
    for (const p of j.items ?? []) if (p && (p.owner?.id === myId || p.collaborative))
      out.push({ id: p.id, name: p.name, total: p.items?.total ?? p.tracks?.total ?? null, img: p.images?.[0]?.url ?? null });
    if (!j.next) break;
  }
  return Response.json({ playlists: out });
}
