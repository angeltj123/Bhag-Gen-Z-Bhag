// Bhaag Gen-Z Bhaag — game server for Render
// Serves the game, runs live marches (rooms + presence) and stores ghosts / leaderboards.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

/* ---------- static files ---------- */
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url === '/' || url === '') url = '/index.html';
  const fp = path.normalize(path.join(PUB, url));
  if (!fp.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

/* ---------- live rooms ---------- */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 96 * 1024 });
const rooms = new Map();          // room name -> Map(peer -> client)
const dirty = new Set();          // rooms whose peer list must be re-sent
const clients = new Set();
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;

function send(ws, m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }
function joinRoom(c, name) {
  if (c.rooms.has(name) || c.rooms.size >= 17) return;
  if (!rooms.has(name)) rooms.set(name, new Map());
  rooms.get(name).set(c.peer, c);
  c.rooms.set(name, { presence: {}, changed: Date.now() });
  dirty.add(name);
}
function leaveRoom(c, name) {
  const r = rooms.get(name);
  if (r) { r.delete(c.peer); if (!r.size) rooms.delete(name); }
  c.rooms.delete(name);
  dirty.add(name);
}
setInterval(() => {
  const now = Date.now();
  for (const name of dirty) {
    const r = rooms.get(name);
    if (!r) continue;
    const peers = [...r.values()].map(c => { const st = c.rooms.get(name); return { peer: c.peer, id: c.id, presence: st.presence, age: now - st.changed }; });
    for (const c of r.values()) send(c.ws, { t: 'peers', room: name, peers });
  }
  dirty.clear();
}, 100);

/* ---------- ghosts / leaderboards ---------- */
const CLEAN_RE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯<>]/g;
function cleanGhostDoc(b) {
  if (!b || typeof b !== 'object') return null;
  const out = { n: String(b.n || '').replace(CLEAN_RE, '').trim().slice(0, 14) || 'Marcher', c: b.c === 'arjun' ? 'arjun' : 'meera', codes: [], runs: {}, at: Date.now() };
  const runs = b.runs && typeof b.runs === 'object' ? b.runs : {};
  for (const k of Object.keys(runs).slice(-20)) {
    if (!/^[a-z0-9-]{1,24}$/.test(k)) continue;
    const r = runs[k]; if (!r || typeof r !== 'object') continue;
    const g = typeof r.g === 'string' && /^[0-9a-z]*$/.test(r.g) ? r.g.slice(0, 12000) : '';
    out.runs[k] = {
      sc: Math.max(0, Math.min(1e7, Math.round(+r.sc || 0))),
      d: Math.max(0, Math.min(150000, Math.round(+r.d || 0))),
      ft: typeof r.ft === 'number' && r.ft > 20 && r.ft < 3600 ? Math.round(r.ft * 10) / 10 : null,
      end: r.end === 'done' ? 'done' : 'jail', g, at: Math.round(+r.at || Date.now())
    };
    out.codes.push(k);
  }
  let best = null;
  for (const k of out.codes) if (!best || out.runs[k].sc > out.runs[best].sc) best = k;
  out.bestSc = best ? out.runs[best].sc : 0;
  out.best = best ? { code: best, sc: out.runs[best].sc, ft: out.runs[best].ft, d: out.runs[best].d } : null;
  return out;
}
function runQuery(q) {
  q = q && typeof q === 'object' ? q : {};
  let rows = [...store.all()].map(([id, data]) => ({ id, data }));
  let code = null;
  if (Array.isArray(q.where) && q.where[0] === 'codes' && q.where[1] === 'array-contains' && typeof q.where[2] === 'string') {
    code = q.where[2];
    rows = rows.filter(r => Array.isArray(r.data.codes) && r.data.codes.includes(code));
  }
  if (Array.isArray(q.orderBy) && q.orderBy[0] === 'bestSc') {
    const dir = q.orderBy[1] === 'desc' ? -1 : 1;
    rows = rows.filter(r => typeof r.data.bestSc === 'number' && r.data.bestSc > 0).sort((a, b) => dir * (a.data.bestSc - b.data.bestSc));
  }
  rows = rows.slice(0, Math.max(1, Math.min(200, +q.limit || 100)));
  // send only what the page needs
  if (code) return rows.map(r => ({ id: r.id, data: { n: r.data.n, c: r.data.c, codes: [code], runs: { [code]: r.data.runs[code] } } }));
  return rows.map(r => ({ id: r.id, data: { n: r.data.n, c: r.data.c, bestSc: r.data.bestSc, best: r.data.best } }));
}
let notifyTimer = null;
function notifySubs() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    for (const c of clients) for (const [sid, q] of c.subs) send(c.ws, { t: 'snap', sid, docs: runQuery(q) });
  }, 250);
}

/* ---------- connections ---------- */
wss.on('connection', ws => {
  const c = { ws, id: null, peer: crypto.randomBytes(8).toString('hex'), rooms: new Map(), subs: new Map(), alive: true, budget: 80, lastSet: 0 };
  clients.add(c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', async raw => {
    if (--c.budget < 0) return;                       // ~40 msgs/s with refill below
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (c.id || typeof m.secret !== 'string' || !/^[0-9a-f]{32}$/.test(m.secret)) return;
      c.id = 'u_' + crypto.createHash('sha256').update('bgb:' + m.secret).digest('base64url').slice(0, 22);
      joinRoom(c, 'lobby');
      return send(ws, { t: 'welcome', id: c.id, peer: c.peer });
    }
    if (!c.id) return;
    switch (m.t) {
      case 'join': if (typeof m.room === 'string' && ROOM_RE.test(m.room)) joinRoom(c, m.room); break;
      case 'leave': if (typeof m.room === 'string' && m.room !== 'lobby') leaveRoom(c, m.room); break;
      case 'presence': {
        const st = c.rooms.get(m.room); if (!st || !m.patch || typeof m.patch !== 'object') break;
        const next = { ...st.presence };
        for (const [k, v] of Object.entries(m.patch)) { if (v === null) delete next[k]; else next[k] = v; }
        if (JSON.stringify(next).length > 4096) break;
        st.presence = next; st.changed = Date.now(); dirty.add(m.room);
        break;
      }
      case 'sub': if (Number.isInteger(m.sid) && c.subs.size < 8) { c.subs.set(m.sid, m.q); send(ws, { t: 'snap', sid: m.sid, docs: runQuery(m.q) }); } break;
      case 'unsub': c.subs.delete(m.sid); break;
      case 'query': send(ws, { t: 'res', rid: m.rid, data: runQuery(m.q) }); break;
      case 'get': send(ws, { t: 'res', rid: m.rid, data: typeof m.id === 'string' ? store.get(m.id) : null }); break;
      case 'set': {
        if (m.id !== c.id) return send(ws, { t: 'res', rid: m.rid, error: 'invalid_argument' });
        if (Date.now() - c.lastSet < 2000) return send(ws, { t: 'res', rid: m.rid, error: 'resource_exhausted' });
        const doc = cleanGhostDoc(m.data);
        if (!doc) return send(ws, { t: 'res', rid: m.rid, error: 'invalid_argument' });
        c.lastSet = Date.now();
        try { await store.put(c.id, doc); send(ws, { t: 'res', rid: m.rid, data: true }); notifySubs(); }
        catch (e) { console.error('save failed', e.message); send(ws, { t: 'res', rid: m.rid, error: 'unavailable' }); }
        break;
      }
    }
  });
  ws.on('close', () => { for (const name of [...c.rooms.keys()]) leaveRoom(c, name); clients.delete(c); });
});
setInterval(() => { for (const c of clients) c.budget = Math.min(80, c.budget + 40); }, 1000);
setInterval(() => { for (const c of clients) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch (e) {} } }, 30000);

store.init().then(() => server.listen(PORT, () => console.log('Bhaag Gen-Z Bhaag running on port ' + PORT)))
  .catch(e => { console.error('Storage failed to start:', e.message); process.exit(1); });
