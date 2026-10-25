# SETUP.md — Running the ML-Based LLM Security System

This project can be run **three different ways**, depending on what you need
right now. Pick one:

| # | Method | Best for | Hot-reload? |
|---|---|---|---|
| 1 | **Docker** | Fastest way to get it running, demos, viva, handing off to someone else | No |
| 2 | **Standard local run** | Running it properly on your own machine without Docker, closest to how it would actually deploy | No |
| 3 | **Development mode** | Actively editing code and wanting instant feedback | Yes |

All three run the exact same code — the only difference is how the four
services (frontend, backend, ML service, database) are started.

The project already ships with a **trained model** (trained on a real,
external dataset — see `README.md` §5 for the measured accuracy) and a real
Groq API key pre-filled in `backend/.env`, alongside a fully working Ollama
configuration set as the default LLM provider. None of the three methods
below require you to train anything or get an API key before your first run.

---

## Method 1 — Docker (recommended default)

**Requires:** Docker Desktop only. Nothing else — Python, Node.js, and
MongoDB all run inside containers automatically.

```bash
# from the project root
docker compose up --build
```

Wait for:
```
llm-security-backend    | [server] LLM Security backend listening on port 5000
llm-security-frontend   | ...serving...
```

Then open:
- Chat: **http://localhost:5173**
- Dashboard: **http://localhost:5173/dashboard**
- Backend health check: **http://localhost:5000/api/health**
- ML service docs: **http://localhost:8000/docs**

**Stop it:**
```bash
docker compose down          # stop
docker compose down -v       # stop AND wipe the database, start fresh next time
```

**If you're using Ollama (default) with Docker:** install Ollama on your
*host* machine (not inside Docker) from ollama.com, then `ollama pull
llama3.2`. Since `localhost` inside a container refers to the container
itself, set this in `backend/.env`:
```
OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
```
(works out of the box on Docker Desktop for Mac/Windows; on Linux add
`extra_hosts: ["host.docker.internal:host-gateway"]` under the `backend`
service in `docker-compose.yml`.)

---

## Method 2 — Standard local run (no Docker, no hot-reload)

This runs the project the way it would actually be deployed — production
builds, no file-watching, no auto-restart — just without Docker's
containerization. Good for a "does this actually work on my machine
end-to-end" check, or handing off to someone who doesn't want Docker.

### Prerequisites (one-time install)
- Python 3.11+
- Node.js 20.x LTS+
- MongoDB Community Server 7.x (or a MongoDB Atlas cloud connection string)

### Step 1 — Start MongoDB
```bash
# Windows (if not already running as a service):
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath="C:\data\db"

# Mac (Homebrew):
brew services start mongodb-community@7.0

# Linux:
sudo systemctl start mongod
```
Confirm it's up: `mongosh --eval "db.runCommand('ping')"`

### Step 2 — Start Ollama (default LLM, no key needed)
```bash
ollama pull llama3.2      # one-time, if not already pulled
curl http://localhost:11434/api/version   # confirm it's running
```
Ollama installs itself as a background service — no terminal window needed
for it after install.

### Step 3 — Start the ML service (production mode, no reload)
```bash
cd ml-service/app
pip install -r ../requirements.txt
python -m nltk.downloader stopwords wordnet punkt punkt_tab omw-1.4
python -m spacy download en_core_web_sm

uvicorn main:app --host 0.0.0.0 --port 8000
```
No `--reload` flag — this is the standard production invocation. The model
is already trained and included; it loads immediately.

### Step 4 — Start the backend (production mode, no nodemon)
```bash
cd backend
npm install
node src/server.js
```
Confirm `backend/.env` has `MONGO_URI=mongodb://localhost:27017/llm_security`
and `ML_SERVICE_URL=http://localhost:8000` (these are already the defaults).

### Step 5 — Build and serve the frontend (production build)
```bash
cd frontend
npm install
npm run build
npx serve -s dist -l 5173
```
This compiles React into optimized static files and serves them — the same
artifact you'd actually deploy, not a dev server.

### Access it
Same URLs as Method 1: **http://localhost:5173** (chat), **/dashboard**,
backend health at **http://localhost:5000/api/health**.

### Stop it
`Ctrl+C` in each terminal; stop MongoDB with the equivalent of the start
command for your OS (e.g. `brew services stop mongodb-community@7.0`).

---

## Method 3 — Development mode (hot-reload, for active coding)

Use this when you're editing code and want to see changes immediately
without restarting anything manually.

Steps 1 and 2 (MongoDB, Ollama) are identical to Method 2. From there:

### ML service (auto-reloads on file save)
```bash
cd ml-service/app
pip install -r ../requirements.txt   # first time only
uvicorn main:app --reload --port 8000
```

### Backend (auto-restarts on file save, via nodemon)
```bash
cd backend
npm install       # first time only
npm run dev
```

### Frontend (instant hot-module-reload in the browser, via Vite)
```bash
cd frontend
npm install        # first time only
npm run dev
```

Open **http://localhost:5173** — edit any file in `frontend/src`,
`backend/src`, or `ml-service/app` and the relevant service reloads
automatically; no manual restarts needed.

### Handy dev-only extras
- **ML service interactive docs:** http://localhost:8000/docs — test
  `/classify` and `/filter` directly in the browser without going through
  the frontend at all.
- **Test your Groq key in isolation** (if you switch `LLM_PROVIDER=groq`):
  ```bash
  cd backend
  node scripts/test-groq-key.js
  ```
- **Retrain the model** after changing the dataset:
  ```bash
  cd ml-service/app
  python train_model.py
  ```

---

## Which one should you actually use?

- **Showing this to your teacher / a viva / a quick demo →** Method 1 (Docker)
- **"Does this really work outside of Docker on my machine" →** Method 2
- **You're actively changing code right now →** Method 3

---

## Troubleshooting (applies to all three methods)

| Symptom | Fix |
|---|---|
| `getaddrinfo ENOTFOUND mongodb` or `ENOTFOUND ml-service` | You're running Methods 2/3 (no Docker) but `.env` still has Docker-only hostnames. Confirm `MONGO_URI` and `ML_SERVICE_URL` in `backend/.env` both say `localhost`, not `mongodb`/`ml-service`. |
| Backend crashes with a `MongooseError ... buffering timed out` | MongoDB isn't running — start it (Step 1 in Method 2/3). |
| `'LogisticRegression' object has no attribute ...` or similar sklearn errors | scikit-learn version mismatch between the shipped model and your installed version. The ML service **self-heals this automatically** — it retrains itself in a few seconds on startup. Just restart it. |
| `unable to get local issuer certificate` when calling Groq | TLS certificate chain problem on your machine, not the API key. Fix your system clock, update Node.js to the latest LTS, or set `GROQ_TLS_INSECURE=true` in `backend/.env` as a local-dev-only fallback. |
| Chat says the LLM provider failed | Using Ollama: confirm it's running (`curl http://localhost:11434/api/version`) and the model is pulled (`ollama pull llama3.2`). Using Groq: run `node scripts/test-groq-key.js` from `backend/` to test the key in isolation. |
| Dashboard shows all zeros | Normal on first run — send a few chat messages first, then refresh. |
| Port already in use (5000/5173/8000/27017) | Something else is using that port. Close it, or change the port mapping in `docker-compose.yml` (Method 1) or the relevant `.env`/`vite.config.js` (Methods 2/3). |
