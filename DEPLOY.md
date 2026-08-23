# Deploying to a public URL (Render, free tier)

This gets you a real public web address like `https://agent-reliability-engine.onrender.com`
— no domain purchase needed, since Render gives every free service a
subdomain with HTTPS automatically. If you buy a real domain later, you can
point it at the same Render service (Render → your service → Settings →
Custom Domains).

**Heads up before you deploy publicly:** this app calls the Gemini API using
your key every time someone clicks "Generate scenarios" or "Run evaluation."
Since you chose to skip adding a password, anyone who gets the link can
trigger those calls and spend your API quota. Only share the link with
people you trust, and keep an eye on usage at
[aistudio.google.com](https://aistudio.google.com/) — you can always ask me
to add a simple password later if you change your mind.

## 1. Put the project on GitHub

Render deploys from a GitHub repo, so the code needs to live there first.

1. Go to [github.com](https://github.com) and sign in (or create a free account).
2. Click the **+** in the top right → **New repository**. Name it something
   like `agent-reliability-engine`, leave it **Public** or **Private** (both
   work with Render), don't add a README, click **Create repository**.
3. Back in VS Code, open the integrated terminal at the project root (the
   folder containing `render.yaml`, not `backend/`) and run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/agent-reliability-engine.git
   git push -u origin main
   ```
   Replace `YOUR-USERNAME` with your actual GitHub username. It'll likely
   open a browser window to sign into GitHub the first time — that's normal.

   Your `.env` file (with your real API key) will **not** be pushed — the
   `.gitignore` file already in this project excludes it. That's intentional
   and important: never commit API keys to a public repo.

## 2. Create a Render account and deploy the Blueprint

1. Go to [render.com](https://render.com) and sign up (GitHub sign-in is
   easiest — it also handles connecting your repos).
2. Click **New +** → **Blueprint**.
3. Pick the `agent-reliability-engine` repo you just pushed. Render will
   detect the `render.yaml` file in the project and read the setup from it
   automatically (build command, start command, free plan, etc.).
4. It'll prompt you for the one secret value the blueprint doesn't hardcode:
   `GEMINI_API_KEY`. Paste your real key in there.
5. Click **Apply** / **Create**. Render will build and deploy — this takes a
   few minutes the first time. Watch the deploy log; when it says something
   like `Uvicorn running on 0.0.0.0:$PORT` and the status turns green, it's live.
6. Your URL is shown at the top of the service page, something like
   `https://agent-reliability-engine.onrender.com`. Open it — same dashboard
   you saw locally.

## Free tier behavior to expect

- **It sleeps.** After 15 minutes with no visitors, Render spins the service
  down. The next visit takes ~30-50 seconds to wake back up (you'll see a
  loading browser tab, then it works normally). This is normal for the free
  tier, not a bug.
- **750 free instance-hours/month** per Render account — plenty for a
  prototype that isn't getting constant traffic.
- **Scenario/run history doesn't persist long-term.** The app stores runs in
  a JSON file on disk (`backend/data/`), and Render's free tier disk isn't
  guaranteed to survive a redeploy. Fine for demoing; don't rely on it for
  long-term history. (Swapping in a real database is the fix if you need
  that later — happy to help when you get there.)

## Updating the deployed site later

Any time you want to push a code change: commit and `git push` again from
your project folder. Render watches the repo and redeploys automatically on
every push to `main`.

## Adding your own domain later

If you buy a domain (Namecheap, Google Domains, etc.) down the line: in the
Render dashboard, go to your service → **Settings** → **Custom Domains** →
**Add Custom Domain**, enter your domain, and Render will show you a DNS
record (usually a `CNAME`) to add at your domain registrar. Once that
propagates (can take a few minutes to a few hours), your domain points at
this same app, HTTPS included.
