// Musicbox listening collector. Runs on GitHub Actions every 30 minutes.
// For each person who turned on background sync in the app, it reads their
// last 50 Spotify plays and adds them to their private history in Firestore.
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const UIDS = (process.env.UIDS || '').split(',').map(x => x.trim()).filter(Boolean);
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function makeDb() {
  if (process.env.MOCK) return globalThis.__mockDb;
  const admin = (await import('firebase-admin')).default;
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const fs = admin.firestore();
  return {
    async get(path) { const d = await fs.doc(path).get(); return d.exists ? d.data() : null; },
    async set(path, data, merge) { await fs.doc(path).set(data, { merge: !!merge }); }
  };
}

async function spotifyToken(db, base, auth) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: auth.refresh }).toString()
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json();
  if (j.refresh_token && j.refresh_token !== auth.refresh) await db.set(`${base}/musicboxMeta/spotifyAuth`, { refresh: j.refresh_token }, true);
  return j.access_token;
}
async function sp(tok, url, params) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url + '?' + new URLSearchParams(params), { headers: { Authorization: 'Bearer ' + tok } });
    if (r.status === 429) { await sleep((+r.headers.get('retry-after') || 2) * 1000 + 300); continue; }
    if (r.status === 204) return {};
    if (!r.ok) throw new Error('spotify ' + r.status);
    return r.json();
  }
  throw new Error('spotify 429');
}
const cp = t => ({ id: t.id || '', n: t.name || '', a: (t.artists || []).map(x => x.name), i: (t.artists || []).map(x => x.id), b: (t.album || {}).name || '', bi: (t.album || {}).id || '', c: (((t.album || {}).images || [])[1] || ((t.album || {}).images || [])[0] || {}).url || '' });

async function one(db, uid) {
  const base = `users/${uid}`;
  const auth = await db.get(`${base}/musicboxMeta/spotifyAuth`);
  if (!auth || !auth.enabled || !auth.refresh) { console.log(uid, 'background sync is off'); return; }
  let tok;
  try { tok = await spotifyToken(db, base, auth); }
  catch (e) { await db.set(`${base}/musicboxMeta/spotifyAuth`, { error: 'Spotify sign in expired. Turn background sync off and on again in the app.', ranAt: Date.now() }, true); console.log(uid, e.message); return; }
  const meta = (await db.get(`${base}/musicboxMeta/sync`)) || {};
  const after = meta.last || 0, prm = { limit: '50' }; if (after) prm.after = String(after);
  const rp = await sp(tok, 'https://api.spotify.com/v1/me/player/recently-played', prm);
  const items = (rp.items || []).filter(x => x && x.track && x.track.name);
  const byDay = new Map();
  items.forEach(x => { const ts = Date.parse(x.played_at), p = { ts, ...cp(x.track), d: x.track.duration_ms || 0 }; const k = dayKey(new Date(ts)); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(p); });
  let added = 0;
  for (const [k, ps] of byDay) {
    const doc = await db.get(`${base}/musicboxDays/${k}`), cur = doc ? (doc.plays || []) : [], out = cur.slice();
    let n = 0;
    for (const p of ps) { if (out.some(x => x.n === p.n && Math.abs(x.ts - p.ts) < 120000)) continue; out.push(p); n++; }
    if (n) { out.sort((a, b) => a.ts - b.ts); await db.set(`${base}/musicboxDays/${k}`, { day: k, plays: out }); added += n; }
  }
  const last = items.reduce((m, x) => Math.max(m, Date.parse(x.played_at)), after);
  await db.set(`${base}/musicboxMeta/sync`, { last, syncedAt: Date.now(), by: 'github' }, true);

  // genres for artists seen in these plays (up to 20 per run)
  const gdoc = (await db.get(`${base}/musicboxMeta/genres`)) || {}, gm = gdoc.m || {}, newG = {};
  const seen = new Map();
  items.forEach(x => (x.track.artists || []).forEach(a => { const k = norm(a.name); if (k && !gm[k] && !seen.has(k)) seen.set(k, a.id); }));
  for (const [k, id] of [...seen].slice(0, 20)) {
    try { const a = await sp(tok, 'https://api.spotify.com/v1/artists/' + id, {}); newG[k] = (a.genres || []).length ? a.genres : ['unknown']; } catch (e) { break; }
    await sleep(150);
  }
  if (Object.keys(newG).length) await db.set(`${base}/musicboxMeta/genres`, { m: newG }, true);

  // one top-lists snapshot per day
  const today = dayKey(new Date());
  if (!(await db.get(`${base}/musicboxTop/${today}`))) {
    try {
      const snap = { at: Date.now(), day: today };
      for (const rng of ['short', 'medium', 'long']) {
        const tr = (await sp(tok, 'https://api.spotify.com/v1/me/top/tracks', { time_range: rng + '_term', limit: '50' })).items || [];
        const ar = (await sp(tok, 'https://api.spotify.com/v1/me/top/artists', { time_range: rng + '_term', limit: '50' })).items || [];
        snap[rng] = { t: tr.map(cp), a: ar.map(a => ({ id: a.id, n: a.name, g: a.genres || [], c: ((a.images || [])[1] || (a.images || [])[0] || {}).url || '' })) };
      }
      await db.set(`${base}/musicboxTop/${today}`, snap);
    } catch (e) { console.log(uid, 'top lists skipped:', e.message); }
  }
  await db.set(`${base}/musicboxMeta/spotifyAuth`, { ranAt: Date.now(), error: '', lastAdded: added }, true);
  console.log(uid, 'added', added, items.length >= 50 && after ? '(may have missed some)' : '');
}

const db = await makeDb();
let failed = 0;
for (const uid of UIDS) { try { await one(db, uid); } catch (e) { failed++; console.log(uid, 'failed:', e.message); } }
if (failed === UIDS.length && UIDS.length) process.exit(1);
