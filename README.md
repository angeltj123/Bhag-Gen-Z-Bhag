# Bhaag Gen-Z Bhaag

A 5,000 m protest march through Delhi to Jantar Mantar. Live marches with friends, ghost races and a global top 10.

## What's inside

| File | What it does |
|---|---|
| `public/index.html` | The game |
| `server.js` | Serves the game, runs live marches, saves ghosts and scores |
| `store.js` | Saves scores to Postgres (permanent) or a local file (temporary) |
| `client-connector.js` | Source of the connector already built into `public/index.html` |
| `render.yaml` | Only for Render Blueprints; a normal Web Service ignores it |
| `src/game.html` | Game source |
| `build.py` | Rebuilds `public/index.html` from `src/game.html` after game changes |

## Put it online on Render

1. **GitHub:** create a new repository (e.g. `bhaag-gen-z-bhaag`) and upload every file and folder here except `node_modules`.
2. **Render:** sign in at render.com → **New → Blueprint** → pick the repository → **Apply**.
   (Or **New → Web Service**: Build `npm install`, Start `node server.js`, Instance type **Free**.)
3. **Permanent scores (required to keep the top 10):** see "Connect a free Neon database" below.
   Without it, ghosts and the top 10 are wiped whenever the free service restarts or goes to sleep (players' own device copies are re-uploaded when they next open the game, but anyone who doesn't return is lost).
4. Open the `https://bhaag-gen-z-bhaag.onrender.com` address Render gives you and play.

## Connect a free Neon database

1. Sign up at neon.tech → **Create project** (any name, region closest to your players, e.g. Singapore/Asia).
2. On the project dashboard click **Connect**, choose **Node.js** / connection string, and copy the string starting with `postgresql://…` (it ends with `sslmode=require`).
3. Render → your web service → **Environment** → **Add Environment Variable**: Key `DATABASE_URL`, Value = the string. **Save Changes** (Render redeploys).
4. Render → **Logs** should now show `Storage: Postgres, … players loaded`. From now on scores survive restarts and sleep.

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
