// Ghost / leaderboard storage.
// With DATABASE_URL set (any Postgres: Render, Neon, Supabase…) data is permanent.
// Without it, data lives in data/ghosts.json — fine for testing, but on Render's free
// plan that file is wiped whenever the service restarts, redeploys or sleeps.
const fs = require('fs');
const path = require('path');

const mem = new Map();
const FILE = path.join(__dirname, 'data', 'ghosts.json');
let pool = null, timer = null;

async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
      max: 4
    });
    await pool.query('CREATE TABLE IF NOT EXISTS ghosts (id TEXT PRIMARY KEY, body JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const r = await pool.query('SELECT id, body FROM ghosts');
    for (const row of r.rows) mem.set(row.id, row.body);
    console.log('Storage: Postgres, ' + mem.size + ' players loaded');
  } else {
    try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) mem.set(k, v); } catch (e) {}
    console.log('Storage: local file (temporary on Render free), ' + mem.size + ' players loaded');
  }
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
module.exports = { init, all, get, put };
