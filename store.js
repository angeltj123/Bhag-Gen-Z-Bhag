// Ghost / leaderboard storage.
// With DATABASE_URL set (any Postgres: Neon, Supabase, Render…) data is permanent.
// Without it — or if the database can't be reached — data lives in data/ghosts.json,
// which on Render's free plan is wiped whenever the service restarts, redeploys or sleeps.
const fs = require('fs');
const path = require('path');

const mem = new Map();
const FILE = path.join(__dirname, 'data', 'ghosts.json');
let pool = null, timer = null;

// Accepts the string however it was pasted: with quotes, a "psql" prefix, or Neon's extra options.
function cleanDatabaseUrl(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^psql\s+/i, '').trim();
  s = s.replace(/^['"]|['"]$/g, '').trim();
  const m = s.match(/postgres(?:ql)?:\/\/\S+/i);
  if (!m) return null;
  try {
    const u = new URL(m[0].replace(/['"]+$/, ''));
    // SSL is set in the Pool options below; drop options the driver warns about or doesn't support.
    for (const k of ['channel_binding', 'sslmode', 'sslrootcert', 'uselibpqcompat']) u.searchParams.delete(k);
    return u.toString();
  } catch (e) { return null; }
}
function hostOf(url) { try { return new URL(url).hostname; } catch (e) { return '?'; } }

function loadFile() {
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) mem.set(k, v); } catch (e) {}
}

async function init() {
  const url = process.env.DATABASE_URL ? cleanDatabaseUrl(process.env.DATABASE_URL) : null;
  if (process.env.DATABASE_URL && !url) {
    console.error('DATABASE ERROR: DATABASE_URL does not look like a postgresql://… link. Paste only the link from Neon. Using temporary storage for now.');
  }
  if (url) {
    try {
      const { Pool } = require('pg');
      pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4, connectionTimeoutMillis: 15000 });
      pool.on('error', e => console.error('DATABASE ERROR (idle client):', e.message));
      await pool.query('CREATE TABLE IF NOT EXISTS ghosts (id TEXT PRIMARY KEY, body JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      const r = await pool.query('SELECT id, body FROM ghosts');
      for (const row of r.rows) mem.set(row.id, row.body);
      console.log('Storage: Postgres (' + hostOf(url) + '), ' + mem.size + ' players loaded');
      return;
    } catch (e) {
      console.error('DATABASE ERROR: could not connect to ' + hostOf(url) + ' — ' + e.message);
      console.error('Check the DATABASE_URL value in Render → Environment. The game keeps running with temporary storage.');
      try { await pool.end(); } catch (_) {}
      pool = null;
    }
  }
  loadFile();
  console.warn('WARNING: scores are in temporary storage and are LOST when Render restarts or the service sleeps. ' + mem.size + ' players loaded');
}

const all = () => mem;
const get = id => mem.get(id) || null;
async function put(id, body) {
  if (pool) await pool.query(
    'INSERT INTO ghosts (id, body, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, updated_at = now()',
    [id, body]);
  mem.set(id, body);
  if (!pool) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(mem))); }
      catch (e) { console.error('file save failed', e.message); }
    }, 500);
  }
}
module.exports = { init, all, get, put, cleanDatabaseUrl };
