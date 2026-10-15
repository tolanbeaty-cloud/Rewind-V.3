'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
type PL = { id: string; name: string; total: number | null };
type T = { uri: string; title: string; artists: string[]; album: string; added: string; local: boolean; img?: string | null };
type Sort = 'playlist' | 'added' | 'title' | 'artist';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type Job = { action: 'remove' | 'restore'; uri: string; id: string; title: string };

export default function Home() {
  const [auth, setAuth] = useState<'loading' | 'no' | 'yes'>('loading');
  const [pls, setPls] = useState<PL[]>([]);
  const [pl, setPl] = useState<PL | null>(null);
  const [tracks, setTracks] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set()); // keyed by URI: Spotify removes every copy of a URI
  const [q, setQ] = useState(''); const [sort, setSort] = useState<Sort>('playlist');
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''); const [undo, setUndo] = useState<{ id: string; name: string; uris: string[] } | null>(null);
  const last = useRef<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [swipeOn, setSwipeOn] = useState(false); const [deck, setDeck] = useState<T[]>([]); const [di, setDi] = useState(0);
  const [dx, setDx] = useState(0); const [fly, setFly] = useState<0 | 1 | -1>(0); const drag = useRef<number | null>(null);
  const jobs = useRef<Job[]>([]); const working = useRef(false); const removedSet = useRef<Set<string>>(new Set<string>());
  const decided = useRef<Map<string, 'keep' | 'remove'>>(new Map<string, 'keep' | 'remove'>());
  const [removedN, setRemovedN] = useState(0); const [pending, setPending] = useState(0); const [failed, setFailed] = useState<Job[]>([]);
  const embedEl = useRef<HTMLDivElement>(null); const ctl = useRef<any>(null); const [fallback, setFallback] = useState(false);
  const paint = useRef<boolean | null>(null); const swipe = useRef<{ x: number; pos: number } | null>(null); const swiped = useRef(false);
  useEffect(() => { const up = () => { paint.current = null; };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); }; }, []);

  const api = async (url: string, body?: any) => {
    const r = await fetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
    const j = await r.json(); if (!r.ok) { if (r.status === 401) setAuth('no'); const er: any = new Error(typeof j.error === 'string' ? j.error : j.error?.message ?? 'Request failed'); if (r.status === 429) er.retryAfter = j.retryAfter ?? 3; throw er; } return j;
  };
  useEffect(() => {
    try { const u = localStorage.getItem('rw-undo'); if (u) setUndo(JSON.parse(u)); } catch {}
    api('/api/playlists').then(j => { setPls([{ id: 'liked', name: 'Liked Songs', total: null }, ...j.playlists]); setAuth('yes'); }).catch(e => { if (e.message !== 'Not connected') setErr(e.message); setAuth(a => a === 'loading' ? 'no' : a); });
  }, []);
  const saveUndo = (u: typeof undo) => { setUndo(u); try { u ? localStorage.setItem('rw-undo', JSON.stringify(u)) : localStorage.removeItem('rw-undo'); } catch {} };

  async function open(p: PL) {
    setPl(p); setTracks([]); setSel(new Set()); setLoaded(0); setErr(''); setQ(''); setSort('playlist');
    try { let off = 0, total = 1; const all: T[] = [];
      while (off < total) { const j = await api(`/api/playlist?id=${p.id}&offset=${off}`); total = j.total; all.push(...j.items); if (!j.step) break; off += j.step; setLoaded(Math.min(off, total)); if (p.total == null) setPl(prev => prev && { ...prev, total: j.total }); }
      setTracks(all); setLoaded(total); startSwipe(all);
    } catch (e: any) { setErr(e.message); }
  }

  const copies = useMemo(() => { const m = new Map<string, number>(); tracks.forEach(t => m.set(t.uri, (m.get(t.uri) ?? 0) + 1)); return m; }, [tracks]);
  const rows = useMemo(() => {
    const s = q.toLowerCase();
    let r = tracks.map((t, idx) => ({ t, idx })).filter(({ t }) => !s || (t.title + ' ' + t.artists.join(' ') + ' ' + t.album).toLowerCase().includes(s));
    const cmp: Record<Sort, (a: any, b: any) => number> = { playlist: (a, b) => a.idx - b.idx,
      added: (a, b) => a.t.added.localeCompare(b.t.added), title: (a, b) => a.t.title.localeCompare(b.t.title), artist: (a, b) => a.t.artists[0]?.localeCompare(b.t.artists[0] ?? '') };
    return r.sort(cmp[sort]); }, [tracks, q, sort]);

  function click(pos: number, e: React.MouseEvent) {
    const n = new Set(sel); const uri = rows[pos].t.uri; const on = !n.has(uri);
    const range = e.shiftKey && last.current !== null ? [Math.min(last.current, pos), Math.max(last.current, pos)] : [pos, pos];
    for (let k = range[0]; k <= range[1]; k++) on ? n.add(rows[k].t.uri) : n.delete(rows[k].t.uri);
    last.current = pos; setSel(n);
  }
  const setRow = (pos: number, on: boolean) => { const t = rows[pos]?.t; if (!t || t.local) return;
    setSel(p => { const n = new Set(p); on ? n.add(t.uri) : n.delete(t.uri); return n; }); };
  function move(e: React.PointerEvent) { if (paint.current === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pos]') as HTMLElement | null;
    if (el) setRow(Number(el.dataset.pos), paint.current); }
  const selectShown = () => setSel(new Set([...sel, ...rows.filter(r => !r.t.local).map(r => r.t.uri)]));
  const selectedRows = tracks.filter(t => sel.has(t.uri));
  const removable = [...sel].filter(u => !u.startsWith('spotify:local'));

  // ---- Swipe mode: right = keep, left = mark for removal (removal itself still needs the confirm step)
  function startSwipe(list: T[]) { const seen = new Set<string>();
    setDeck(list.filter(t => !t.local && !seen.has(t.uri) && (seen.add(t.uri), true)));
    decided.current.clear(); removedSet.current = new Set<string>(); setRemovedN(0); setFailed([]);
    setDi(0); setDx(0); setFly(0); setFallback(false); setPlaying(null); setSwipeOn(true); }
  // One song at a time: swipe left sends a single remove request right away (queued so requests never overlap).
  async function drain() {
    if (working.current) return; working.current = true;
    while (jobs.current.length) {
      const job = jobs.current[0]; let ok = false, msg = '';
      if (job.action === 'restore' && !removedSet.current.has(job.uri)) { jobs.current.shift(); setPending(jobs.current.length); continue; }
      for (let attempt = 0; attempt < 6 && !ok; attempt++) {
        try { await api('/api/playlist', { id: job.id, action: job.action, uris: [job.uri] }); ok = true; }
        catch (e: any) { msg = e.message; if (e.retryAfter !== undefined) await sleep((e.retryAfter || 3) * 1000 + 500); else break; }
      }
      jobs.current.shift();
      if (ok) { if (job.action === 'remove') removedSet.current.add(job.uri); else removedSet.current.delete(job.uri); setRemovedN(removedSet.current.size); }
      else if (job.action === 'remove') { setFailed(f => [...f, job]); setErr(`Couldn't remove "${job.title}": ${msg}`); }
      else setErr(`Couldn't put back "${job.title}": ${msg}`);
      setPending(jobs.current.length);
    }
    working.current = false;
  }
  function enqueue(job: Job) { jobs.current.push(job); setPending(jobs.current.length); drain(); }
  function decide(keep: boolean) { const t = deck[di]; if (!t || fly || !pl) return; setFly(keep ? 1 : -1); const id = pl.id;
    decided.current.set(t.uri, keep ? 'keep' : 'remove');
    setTimeout(() => { if (!keep) enqueue({ action: 'remove', uri: t.uri, id, title: t.title }); setDi(i => i + 1); setFly(0); setDx(0); }, 180); }
  function back() { if (di === 0 || fly || !pl) return; const prev = deck[di - 1];
    if (decided.current.get(prev.uri) === 'remove') {
      const k = jobs.current.findIndex((j, n) => n > 0 && j.action === 'remove' && j.uri === prev.uri);
      if (k > 0) { jobs.current.splice(k, 1); setPending(jobs.current.length); }
      else enqueue({ action: 'restore', uri: prev.uri, id: pl.id, title: prev.title });
      setFailed(f => f.filter(x => x.uri !== prev.uri));
    }
    decided.current.delete(prev.uri); setDi(di - 1); }
  function retryFailed() { const f = failed; setFailed([]); setErr(''); f.forEach(enqueue); }
  function leave() {
    if (pl && removedSet.current.size) { const n = removedSet.current.size; saveUndo({ id: pl.id, name: pl.name, uris: [...removedSet.current] });
      setPls(ps => ps.map(x => x.id === pl.id && x.total != null ? { ...x, total: x.total - n } : x)); }
    setSwipeOn(false); setPl(null); setSel(new Set()); }
  useEffect(() => { if (!swipeOn) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') decide(true); else if (e.key === 'ArrowLeft') decide(false); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); });
  // Spotify's embed player API lets us switch songs and call play() after each swipe. Falls back to a plain embed.
  useEffect(() => { if (!swipeOn) return; let dead = false; const w = window as any;
    const init = (api: any) => { if (dead || !embedEl.current) return;
      api.createController(embedEl.current, { uri: deck[0]?.uri, width: '100%', height: 80 }, (c: any) => { ctl.current = c; c.addListener?.('ready', () => { try { c.play(); } catch {} }); }); };
    if (w.__spApi) init(w.__spApi);
    else { w.onSpotifyIframeApiReady = (api: any) => { w.__spApi = api; init(api); };
      if (!document.getElementById('sp-api')) { const sc = document.createElement('script'); sc.id = 'sp-api'; sc.src = 'https://open.spotify.com/embed/iframe-api/v1'; sc.async = true; sc.onerror = () => setFallback(true); document.body.appendChild(sc); } }
    const t = setTimeout(() => { if (!ctl.current) setFallback(true); }, 5000);
    return () => { dead = true; clearTimeout(t); try { ctl.current?.destroy?.(); } catch {} ctl.current = null; }; }, [swipeOn]);
  useEffect(() => { const c = ctl.current; if (swipeOn && c && deck[di]) { try { c.loadUri(deck[di].uri); c.play(); } catch {} } }, [di]);
  // Sends small batches one at a time, waits and retries when Spotify rate-limits, reports exactly what finished.
  async function batch(action: 'remove' | 'restore', id: string, uris: string[]) {
    const CH = id === 'liked' ? 40 : 100; const done: string[] = []; let error = '';
    setProg({ done: 0, total: uris.length });
    try {
      for (let i = 0; i < uris.length; i += CH) {
        const chunk = uris.slice(i, i + CH);
        for (let attempt = 0; ; attempt++) {
          try { await api('/api/playlist', { id, action, uris: chunk }); break; }
          catch (e: any) { if (e.retryAfter !== undefined && attempt < 6) { await new Promise(r => setTimeout(r, (e.retryAfter || 3) * 1000 + 500)); continue; } throw e; }
        }
        done.push(...chunk); setProg({ done: done.length, total: uris.length });
        await new Promise(r => setTimeout(r, 250));
      }
    } catch (e: any) { error = e.message; }
    setProg(null); return { done, error };
  }
  async function remove() {
    if (!pl) return; setBusy(true); setErr('');
    const { done, error } = await batch('remove', pl.id, removable);
    if (error) setErr(`Removed ${done.length} of ${removable.length}. ${error} Select the rest and try again.`);
    if (done.length) { const d = new Set(done); saveUndo({ id: pl.id, name: pl.name, uris: done });
      setTracks(t => t.filter(x => !d.has(x.uri))); setSel(s => new Set([...s].filter(u => !d.has(u)))); }
    setConfirm(false); setBusy(false); setSel(new Set());
    setPls(ps => ps.map(x => x.id === pl.id && x.total != null ? { ...x, total: x.total - done.length } : x)); setPl(null);
  }
  async function restore() {
    if (!undo) return; setBusy(true); setErr('');
    const u = undo; const { done, error } = await batch('restore', u.id, u.uris);
    if (error) { setErr(`Restored ${done.length} of ${u.uris.length}. ${error}`); const d = new Set(done); saveUndo({ ...u, uris: u.uris.filter(x => !d.has(x)) }); }
    else saveUndo(null);
    if (pl?.id === u.id) open(pl); setBusy(false);
  }
  async function disconnect() { await fetch('/api/auth/logout', { method: 'POST' }); saveUndo(null); setPl(null); setAuth('no'); }

  return <div className="app"><nav><b>Rewind</b>
    <button className={!pl ? 'on' : ''} onClick={leave}>Playlists</button>
    {auth === 'yes' && <button onClick={disconnect}>Disconnect Spotify</button>}</nav>
  <main>
    {err && <div className="err">{err}</div>}
    {undo && <div className="card row"><span>Removed {undo.uris.length} songs from "{undo.name}".</span>
      <button className="btn alt" disabled={busy} onClick={restore}>Undo (re-adds to end of playlist)</button>
      <button className="btn alt" onClick={() => saveUndo(null)}>Dismiss</button></div>}
    {auth === 'loading' && <p className="m">Loading…</p>}
    {auth === 'no' && <div className="card"><h1>Remove songs from playlists, faster.</h1><a href="/api/auth/login"><button className="btn">Connect Spotify</button></a></div>}
    {auth === 'yes' && !pl && <><h1>Pick a playlist</h1><p className="m">Only playlists you own or collaborate on are shown. Spotify doesn't allow edits to others'.</p>
      {pls.map(p => <div className="card row" key={p.id} style={{ cursor: 'pointer', justifyContent: 'space-between' }} onClick={() => open(p)}><b>{p.name}</b><span className="m">{p.total ?? '?'} songs</span></div>)}</>}
    {pl && <>
      <h1>{pl.name}</h1>
      {loaded < (pl.total ?? 0) && <><p className="m">Loading {loaded} / {pl.total}…</p><div className="bar"><i style={{ width: loaded / (pl.total || 1) * 100 + '%' }} /></div></>}
      {!swipeOn && !confirm && !err && <p className="m">Loading songs…</p>}
      {err && !swipeOn && !confirm && <button className="btn alt" onClick={() => setPl(null)}>Back to playlists</button>}
      {confirm && <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'grid', placeItems: 'center', zIndex: 5 }}><div className="card" style={{ maxWidth: 480 }}>
        <h2>Remove {removable.length} songs from "{pl.name}"?</h2>
        <p className="m">{selectedRows.slice(0, 5).map(t => t.title).join(', ')}{selectedRows.length > 5 ? ` and ${selectedRows.length - 5} more` : ''}</p>
        {selectedRows.some(t => (copies.get(t.uri) ?? 0) > 1) && <p>Some songs appear more than once. Spotify removes every copy of a selected song.</p>}
        {prog && <><p className="m">Removing {prog.done} / {prog.total}. Keep this tab open.</p><div className="bar"><i style={{ width: prog.done / (prog.total || 1) * 100 + '%' }} /></div><br /></>}
        <div className="row"><button className="btn" disabled={busy} onClick={remove}>{busy ? 'Removing…' : 'Remove'}</button><button className="btn alt" onClick={() => { setConfirm(false); setSwipeOn(true); }}>Cancel</button></div></div></div>}
      {swipeOn && <div style={{ position: 'fixed', inset: 0, background: '#121212', zIndex: 8, overflowY: 'auto', padding: 12 }}><div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b>{Math.min(di + 1, deck.length)} / {deck.length}</b><span className="m">Removed: {removedN}{pending > 0 ? ` · saving ${pending}…` : ''}</span>
          <button className="btn alt" style={{ padding: '6px 14px' }} onClick={() => setDi(deck.length)}>Finish</button></div>
        <div className="bar" style={{ margin: '10px 0' }}><i style={{ width: di / (deck.length || 1) * 100 + '%' }} /></div>
        {deck[di] ? <>
          <div style={{ marginBottom: 10 }}>{fallback ? <iframe key={deck[di].uri} src={`https://open.spotify.com/embed/track/${deck[di].uri.split(':')[2]}`} width="100%" height="80" allow="encrypted-media; autoplay" style={{ border: 0, borderRadius: 12 }} />
            : <div key="embed"><div ref={embedEl} /></div>}</div>
          <div key={di} onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => { if (fly) return; drag.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e: React.PointerEvent<HTMLDivElement>) => { if (drag.current !== null) setDx(e.clientX - drag.current); }}
            onPointerUp={() => { const d = dx; drag.current = null; if (Math.abs(d) > 110) decide(d > 0); else setDx(0); }}
            onPointerCancel={() => { drag.current = null; setDx(0); }}
            style={{ background: '#1e1e1e', borderRadius: 20, padding: 12, textAlign: 'center', touchAction: 'none', userSelect: 'none', cursor: 'grab', position: 'relative',
              transform: fly ? `translateX(${fly * 600}px) rotate(${fly * 30}deg)` : `translateX(${dx}px) rotate(${dx / 15}deg)`, transition: drag.current === null ? 'transform .18s' : 'none' }}>
            <div style={{ position: 'absolute', top: 24, left: 24, color: '#1db954', border: '3px solid #1db954', borderRadius: 8, padding: '2px 10px', fontWeight: 800, opacity: Math.min(1, Math.max(0, dx / 100)) }}>KEEP</div>
            <div style={{ position: 'absolute', top: 24, right: 24, color: '#ff4d4d', border: '3px solid #ff4d4d', borderRadius: 8, padding: '2px 10px', fontWeight: 800, opacity: Math.min(1, Math.max(0, -dx / 100)) }}>REMOVE</div>
            {deck[di].img ? <img src={deck[di].img!} alt="" draggable={false} style={{ width: 'min(100%, 34vh)', display: 'block', margin: '0 auto', borderRadius: 14, aspectRatio: '1', objectFit: 'cover' }} />
              : <div style={{ width: 'min(100%, 34vh)', margin: '0 auto', aspectRatio: '1', display: 'grid', placeItems: 'center', fontSize: 48, background: '#333', borderRadius: 14 }}>♪</div>}
            <h2 style={{ margin: '8px 0 2px', fontSize: 20 }}>{deck[di].title}</h2>
            <p className="m" style={{ margin: 0 }}>{deck[di].artists.join(', ')} · {deck[di].album}</p>
            <p className="m" style={{ margin: '4px 0 0' }}>Saved {new Date(deck[di].added).toLocaleDateString()}</p></div>
          <div className="row" style={{ justifyContent: 'center', margin: '10px 0' }}>
            <button className="btn alt" onClick={() => decide(false)}>✕ Remove</button>
            <button className="btn alt" disabled={di === 0} onClick={back}>↶ Back</button>
            <button className="btn" onClick={() => decide(true)}>♥ Keep</button></div>
          <p className="m" style={{ fontSize: 13 }}>Swipe right to keep, left to remove it from your playlist right away. ↶ Back puts the last removal back. On iPhone, tap play on the player once; after that, songs should start as you swipe.</p>
        </> : <div className="card" style={{ textAlign: 'center' }}><h2>All done</h2>
          <p>{removedN} songs removed from "{pl.name}".{pending > 0 ? ` Finishing up… ${pending} left.` : ''}</p>
          {failed.length > 0 && <><p>{failed.length} couldn't be removed: {failed.slice(0, 3).map(f => f.title).join(', ')}{failed.length > 3 ? '…' : ''}</p><button className="btn alt" onClick={retryFailed}>Retry failed</button><br /><br /></>}
          <button className="btn" disabled={pending > 0} onClick={leave}>Back to playlists</button></div>}
      </div></div>}
    </>}
  </main></div>;
}
