/* Connects the game to this server: live rooms, ghosts and leaderboards.
   Provides the same small interface the game uses (window.claude.use). */
(function () {
  if (window.claude) return;
  if (!/^https?:$/.test(location.protocol)) return;          // opened as a local file: play solo
  const WS_URL = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
  let ws = null, ready = false, myId = null, myPeer = null, rid = 0, started = false;
  const queue = [], pending = new Map(), rooms = new Map(), subs = new Map(), connListeners = new Set();
  let resolveWelcome; const welcome = new Promise(r => { resolveWelcome = r; });

  let secret = null;
  try { secret = localStorage.getItem('bgb-secret'); } catch (e) {}
  if (!secret || !/^[0-9a-f]{32}$/.test(secret)) {
    secret = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('bgb-secret', secret); } catch (e) {}
  }

  function send(m) { if (ready && ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else queue.push(m); }
  function setReady(v) { ready = v; connListeners.forEach(fn => { try { fn(v); } catch (e) {} }); }
  function snapOf(docs) {
    const ds = (docs || []).map(d => ({ id: d.id, exists: true, data: () => d.data, metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs: ds, size: ds.length, empty: !ds.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function connect() {
    started = true;
    try { ws = new WebSocket(WS_URL); } catch (e) { return setTimeout(connect, 3000); }
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', secret }));
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'welcome') {
        myId = m.id; myPeer = m.peer; resolveWelcome();
        ready = true;
        for (const [name, r] of rooms) {
          if (name !== 'lobby') ws.send(JSON.stringify({ t: 'join', room: name }));
          if (Object.keys(r.presence).length) ws.send(JSON.stringify({ t: 'presence', room: name, patch: r.presence }));
        }
        for (const s of subs.values()) ws.send(JSON.stringify(s.msg));
        queue.splice(0).forEach(x => ws.send(JSON.stringify(x)));
        setReady(true);
      } else if (m.t === 'peers') {
        const r = rooms.get(m.room); if (!r) return;
        const now = Date.now();
        r.peers = Object.freeze((m.peers || []).map(p => Object.freeze({
          peer: p.peer, by: p.id, isMe: p.id === myId, sameTab: p.peer === myPeer, kind: 'viewer', guest: false,
          presence: Object.freeze(p.presence || {}), updatedAt: now - (p.age || 0)
        })));
        r.listeners.forEach(fn => { try { fn({ peers: r.peers, joined: [], left: [], updated: [] }); } catch (e) {} });
      } else if (m.t === 'snap') {
        const s = subs.get(m.sid); if (s) { try { s.next(snapOf(m.docs)); } catch (e) {} }
      } else if (m.t === 'res') {
        const p = pending.get(m.rid); if (!p) return;
        pending.delete(m.rid);
        m.error ? p.reject({ code: m.error, message: m.error }) : p.resolve(m.data);
      }
    };
    ws.onclose = () => { setReady(false); setTimeout(connect, 2000); };
  }
  function ensure() { if (!started) connect(); }
  function request(m) {
    ensure();
    return new Promise((resolve, reject) => {
      const id = ++rid; pending.set(id, { resolve, reject }); send({ ...m, rid: id });
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject({ code: 'unavailable', message: 'timeout' }); } }, 10000);
    });
  }

  /* ---- rooms ---- */
  function makeRoom(name) {
    let r = rooms.get(name);
    if (!r) { r = { peers: Object.freeze([]), listeners: new Set(), presence: {} }; rooms.set(name, r); }
    return {
      name,
      presence(patch) { for (const k in patch) { if (patch[k] === null) delete r.presence[k]; else r.presence[k] = patch[k]; } send({ t: 'presence', room: name, patch }); return Promise.resolve(); },
      onPeers(fn) { r.listeners.add(fn); setTimeout(() => fn({ peers: r.peers, joined: r.peers, left: [], updated: [] }), 0); return () => r.listeners.delete(fn); },
      peers() { return r.peers; },
      emit() { return Promise.resolve(); },
      on() { return () => {}; },
      connected() { return ready; },
      onConnection(fn) { connListeners.add(fn); setTimeout(() => fn(ready), 0); return () => connListeners.delete(fn); },
      leave() { rooms.delete(name); send({ t: 'leave', room: name }); return Promise.resolve(); }
    };
  }
  const lobby = makeRoom('lobby');
  lobby.join = async name => {
    if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) throw { code: 'invalid_argument', message: 'bad room name' };
    const existed = rooms.has(name); const room = makeRoom(name);
    if (!existed) send({ t: 'join', room: name });
    return room;
  };

  /* ---- ghost store ---- */
  function query(state) {
    return {
      where(f, op, v) { return query({ ...state, where: [f, op, v] }); },
      orderBy(f, dir) { return query({ ...state, orderBy: [f, dir || 'asc'] }); },
      limit(n) { return query({ ...state, limit: n }); },
      get() { return request({ t: 'query', q: state }).then(snapOf); },
      onSnapshot(next, err) {
        ensure();
        const sid = ++rid, msg = { t: 'sub', sid, q: state };
        subs.set(sid, { msg, next, err }); send(msg);
        return () => { subs.delete(sid); send({ t: 'unsub', sid }); };
      }
    };
  }
  const db = {
    collection(p) { if (p !== 'ghosts') throw new TypeError('unknown collection'); return query({}); },
    doc(p) {
      const id = String(p).split('/')[1];
      return {
        id, path: p,
        get: () => request({ t: 'get', id }).then(d => ({ id, exists: !!d, data: () => d || undefined, metadata: { fromCache: false, hasPendingWrites: false } })),
        set: data => request({ t: 'set', id, data }).then(() => {})
      };
    }
  };
  const user = {
    id: async () => { ensure(); const ok = await Promise.race([welcome.then(() => true), new Promise(r => setTimeout(() => r(false), 10000))]); return ok ? myId : null; },
    isOwner: () => false, canEdit: () => false, can: () => null
  };

  window.claude = {
    use: async name => {
      ensure();
      if (name === 'room') {
        const ok = await Promise.race([welcome.then(() => true), new Promise(r => setTimeout(() => r(false), 10000))]);
        return ok ? lobby : null;
      }
      if (name === 'db') return db;
      if (name === 'user') return user;
      return null;
    }
  };
})();
