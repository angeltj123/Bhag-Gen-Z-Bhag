# Bhaag Gen-Z Bhaag

A 5,000 m protest march through Delhi to Jantar Mantar. Live marches with friends, ghost races and a global top 10.

## What's inside

| File | What it does |
|---|---|
| `public/index.html` | The game |
| `server.js` | Serves the game, runs live marches, saves ghosts and scores |
| `store.js` | Saves scores to Postgres (permanent) or a local file (temporary) |
| `client-connector.js` | Source of the connector already built into `public/index.html` |
| `render.yaml` | One-click Render setup |

## Put it online on Render

1. **GitHub:** create a new repository (e.g. `bhaag-gen-z-bhaag`) and upload every file and folder here except `node_modules`.
2. **Render:** sign in at render.com → **New → Blueprint** → pick the repository → **Apply**.
   (Or **New → Web Service**: Build `npm install`, Start `node server.js`, Instance type **Free**.)
3. **Permanent scores (recommended):** create a free Postgres database (Neon or Supabase), copy its connection string, and add it in Render → your service → **Environment** as `DATABASE_URL`. Save; Render redeploys.
   Without it the game still works, but ghosts and the top 10 are wiped whenever the free service restarts or goes to sleep.
4. Open the `https://bhaag-gen-z-bhaag.onrender.com` address Render gives you and play.

## Use your own domain (e.g. game.sarvotarzan.org)

Render → your service → **Settings → Custom Domains → Add** `game.sarvotarzan.org`.
Then in cPanel → **Zone Editor**, add the **CNAME** record Render shows (name `game`, pointing to `bhaag-gen-z-bhaag.onrender.com`). Render adds HTTPS automatically.

To show the game inside a WordPress page, add a **Custom HTML** block:

```html
<iframe src="https://game.sarvotarzan.org/" style="width:100%;aspect-ratio:16/9;border:0" allow="fullscreen; autoplay; screen-wake-lock"></iframe>
```

## Good to know

- On Render's free plan the server sleeps after 15 minutes with no players; the next visitor waits about a minute while it wakes up.
- Players are anonymous: each browser gets its own private key, so nobody can overwrite another player's ghost. Clearing browser data starts a new player.
- Run locally: `npm install` then `npm start`, and open http://localhost:3000
