# Deploying Rangeland Awareness

Start to finish, for someone who has never seen this repository. Follow it in
order. Every command is meant to be pasted as written, from the repository root
unless the command says otherwise.

If you only want the short version: copy `.env.example` to `.env`, fill in the
five required values, run `docker compose up --build`, then run the four checks
in [Verify it is actually up](#4-verify-it-is-actually-up). Everything else on
this page is detail for when one of those four fails.

---

## What you are deploying

Three pieces. Two of them are in this repository, the third is not.

```
  analyst's browser
        │
        ├── HTML, JS ──────────▶  web       Next.js app, port 3000
        │                          │
        │                          └── server-side calls ──▶ backend
        │
        └── tiles, run polling ─▶  backend  Django, port 8000
                                    │
                                    └── WMS/WCS/WFS ──▶  GeoServer
                                                          (already exists,
                                                           not deployed here)
```

**web** renders pages and computes nothing. **backend** owns every rule, every
calculation and the only connection to GeoServer. **GeoServer** is existing
infrastructure, usually `http://192.168.0.40:8080/geoserver` on the KSA LAN. It
is a dependency of this deployment, not part of it, and this compose file will
not create, configure or migrate it.

Note the two arrows leaving the browser. The browser talks to the backend
**directly** for map tiles and for polling a running analysis. That is why both
ports are published to the host and why the browser-facing backend URL has to be
an address the analyst's machine can resolve. More on that in
[The two backend URLs](#the-two-backend-urls), which is the one concept in this
document worth reading twice.

The files that make up the deployment:

| file | what it is |
| --- | --- |
| `docker-compose.yml` | the two services, their volumes, their wiring |
| `Dockerfile.web` | builds the Next.js app into a standalone image |
| `Dockerfile.backend` | builds the Django service on GDAL's own base image |
| `.env.example` | the template for `.env`, with every variable explained |
| `.dockerignore` | what never enters a build context, including `.env` |

---

## Before you start

You need:

- **Docker Engine 24 or newer, with the Compose v2 plugin.** Check both:
  ```bash
  docker --version
  docker compose version
  ```
  If `docker compose version` fails but `docker-compose --version` works, you
  have the old standalone v1 tool. This file uses v2 syntax (`depends_on` with
  `condition: service_healthy`, and the `VAR:?message` form). Install the
  plugin rather than trying to make v1 work.
- **About 4GB of disk** for the images. The backend base image carries GDAL and
  is roughly a gigabyte on its own, and the first build downloads it.
- **A reachable GeoServer**, with its base URL. Test it from the machine you are
  deploying on, before you start:
  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' \
    "http://192.168.0.40:8080/geoserver/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0"
  ```
  A `200` means you are on the right network. Anything else, including a hang,
  means fix that first: the app will deploy without it, but no map will draw and
  no analysis can run.
- **Two free ports**, 3000 and 8000 by default. Both are configurable.

You do **not** need Node, Python, GDAL or a virtualenv on the host. Everything
is built and run inside containers. The development machine this repository
lives on cannot even `pip install`, which is fine: the images can.

---

## 1. Get the code

```bash
git clone <the repository URL> rangeland-awareness
cd rangeland-awareness
```

Everything below runs from that directory, the one holding `docker-compose.yml`.

---

## 2. Write the configuration

```bash
cp .env.example .env
```

Now open `.env` and fill in the five required values. Compose refuses to start
if any of them is missing, and it prints the name of the one you forgot. Read
`.env.example` as you go: every variable there has a line saying what breaks
when it is wrong.

### DJANGO_SECRET_KEY

Generate a fresh one. Do not reuse another deployment's:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

If the host has no Python:

```bash
openssl rand -base64 64 | tr -d '\n'; echo
```

Paste the output as the value. Django falls back to a placeholder called
`dev-only-not-a-secret` when this is unset, which is exactly the kind of default
that reaches production unnoticed, so compose refuses to start instead.

### DJANGO_ALLOWED_HOSTS

Comma separated hostnames the backend answers to. No scheme, no port, no
spaces. **Include `backend`**: the web container calls the backend over the
internal network using that name, and Django rejects a `Host` header it does not
recognise with a 400 before any view runs.

```
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend,ra.ksa.go.ke
```

### CORS_ALLOWED_ORIGINS

Comma separated origins the analyst's browser loads the **app** from, with the
scheme and the port, no trailing slash. This is the app's address, not the
backend's.

```
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

For a real host:

```
CORS_ALLOWED_ORIGINS=https://ra.ksa.go.ke
```

Get this wrong and every page still renders, but the browser blocks the tile and
polling requests. The map is blank and the only evidence is in a console nobody
has open.

### NEXT_PUBLIC_BACKEND_URL

The backend's address **as the analyst's browser resolves it**. See the next
section before you fill this in.

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### GEOSERVER_URL

The GeoServer base URL, no trailing slash:

```
GEOSERVER_URL=http://192.168.0.40:8080/geoserver
```

Add `GEOSERVER_USER` and `GEOSERVER_PASSWORD` only if your GeoServer requires
them. They stay on the server side; the browser never addresses GeoServer.

### The two backend URLs

There are two of them and they are usually different. This is the single most
common way this deployment breaks.

| variable | who reads it | value under compose | when a change takes effect |
| --- | --- | --- | --- |
| `BACKEND_URL` | the Next **server** process | `http://backend:8000` | restart |
| `NEXT_PUBLIC_BACKEND_URL` | the analyst's **browser** | a real, reachable address | **rebuild** |

`BACKEND_URL` is set for you in `docker-compose.yml` and you should not need to
touch it. `backend` is a DNS name that exists only inside the compose network.

`NEXT_PUBLIC_BACKEND_URL` is yours to set, and it must be an address the
analyst's laptop can resolve. Next.js inlines every `NEXT_PUBLIC_*` variable
into the JavaScript bundle **at build time**, by substituting the text
literally, so this value is frozen into the code the browser downloads.

Two consequences:

1. **Putting `http://backend:8000` here produces the worst failure in this
   system.** Every page server-renders perfectly, the browser hydrates, and then
   every tile request and every run poll goes to a hostname that exists only
   inside the container network. You get a working-looking app with a blank map
   and no server-side error at all.
2. **Changing it is a rebuild, not a restart.** `docker compose build web` then
   `docker compose up -d web`. Editing `.env` and restarting will change what
   the server sees and leave the browser bundle exactly as it was.

Pick the value by asking: what would an analyst type into a browser on their own
machine to reach the backend?

| where analysts sit | value |
| --- | --- |
| the same machine as the containers | `http://localhost:8000` |
| the office LAN, containers on a server | `http://192.168.0.50:8000` (the server's LAN address) |
| behind a reverse proxy with TLS | `https://ra.ksa.go.ke/backend` or `https://api.ra.ksa.go.ke` |

Whatever you choose, the app's own origin must appear in
`CORS_ALLOWED_ORIGINS`, and the backend's hostname must appear in
`DJANGO_ALLOWED_HOSTS`. Those three values are one decision written three times.

---

## 3. Build and start

```bash
docker compose up --build -d
```

The first build takes a while. It downloads the GDAL base image (about a
gigabyte), installs the app's npm dependencies and runs a production Next build.
Later builds reuse the cached layers and are much faster.

`-d` runs it in the background. Leave it off the first time if you want to watch
the logs go by.

What happens, in order:

1. Both images build.
2. `backend` starts, applies its database migrations, and starts gunicorn.
3. Docker health-checks `backend` until `/api/v1/health` answers.
4. Only then does `web` start. That is `condition: service_healthy` in the
   compose file, and it is why the first analyst to load a page does not see
   "the analysis service did not answer".

Watch it settle:

```bash
docker compose ps
```

Both services should reach `running`, and `backend` should show `(healthy)`.
`web` shows `(healthy)` within about 15 seconds of starting. If `backend` sits
at `(health: starting)` for more than a minute, go to
[Troubleshooting](#troubleshooting).

---

## 4. Verify it is actually up

Four checks. Run all four. "The container is running" is not one of them: every
failure in this system has a state where both containers are running and
nothing works.

### Check 1: the backend answers, and says what it can reach

```bash
curl -sS http://localhost:8000/api/v1/health
```

The response is JSON with a `status` and a `geoserver` block, like this:

```json
{"status":"ok","service":"rangeland-backend","version":"1.0.0",
 "geoserver":{"endpoint":"http://192.168.0.40:8080/geoserver",
              "reachable":true,"detail":null,"layerCount":23,"elapsedMs":221}}
```

Read three things:

- `status` is `ok` when a run could start now, `degraded` when the service is up
  and GeoServer is not.
- `geoserver.endpoint` is the URL the backend is **actually** using. If that is
  not the server you meant, your `GEOSERVER_URL` is wrong or `.env` was not
  picked up.
- `geoserver.reachable` false, with the reason in `detail`. A 401 there means
  credentials, a timeout means the network.

A `degraded` backend still serves every read endpoint, so an analysis that
already finished stays viewable.

### Check 2: GDAL is present in the backend image

This is what makes every raster operation possible, and it is the one dependency
that cannot be patched in later.

```bash
docker compose exec backend python3 -c "from osgeo import gdal; print(gdal.__version__)"
```

Prints a GDAL version (`3.12.2` for the pinned base image). An `ImportError`
here means the image was built from the wrong base.

### Check 3: the web tier is up AND can reach the backend

```bash
curl -sS http://localhost:3000/api/health
```

This is the app's own health route, and it answers two questions at once:

```json
{"status":"ok","service":"rangeland-app","version":"dev","elapsedMs":12,
 "backend":{"url":"http://backend:8000","reachable":true,"detail":null,
            "status":"ok","geoserver":{"...":"..."}}}
```

- It always returns HTTP 200 when the container is alive. A web tier serving
  pages is not broken because the analysis service is down.
- `backend.reachable: false` means the web container cannot reach the backend
  over the internal network, and `backend.detail` says whether the backend
  refused the request or never answered at all.
- `status: "degraded"` with `backend.reachable: true` means the backend is up
  and **GeoServer** is not. Go back to check 1.

### Check 4: the browser can reach the backend

The first three checks all run on the host or inside the network. This one is
the whole point of the `NEXT_PUBLIC_BACKEND_URL` section above, and none of the
others can catch it.

From **an analyst's machine**, not the server, in a browser, open the exact URL
you put in `NEXT_PUBLIC_BACKEND_URL` with `/api/v1/health` on the end:

```
http://192.168.0.50:8000/api/v1/health
```

You should see the same JSON as check 1. If that URL does not load in an
analyst's browser, the map will be blank for that analyst no matter how healthy
everything looks on the server.

Then open the app itself at `http://<host>:3000`, sign in, and open a topic with
a map on it. Tiles drawing is the end-to-end proof: it exercises the browser,
the backend's tile proxy, and GeoServer in one action.

---

## Day to day

```bash
docker compose ps                    # what is running and healthy
docker compose logs -f backend       # follow the backend log
docker compose logs -f web           # follow the app log
docker compose logs --since 10m      # both, recent
docker compose restart backend       # restart one service
docker compose down                  # stop everything, KEEP the volumes
docker compose up -d                 # start it again
```

`docker compose down` does not delete data. `docker compose down -v` does: the
`-v` destroys the named volumes, including the database. There is no
confirmation prompt.

---

## Pointing at a different GeoServer

One variable, one restart. Never an edit to a source file.

```bash
# in .env
GEOSERVER_URL=http://geoserver.example.go.ke/geoserver
GEOSERVER_USER=someone          # only if it is secured
GEOSERVER_PASSWORD=...          # only if it is secured
```

```bash
docker compose up -d backend
curl -sS http://localhost:8000/api/v1/health
```

Confirm `geoserver.endpoint` in the response is the new URL. This is a restart,
not a rebuild: the backend reads the environment at startup.

Two things to expect afterwards:

- The layer catalogue is cached for `GEOSERVER_CAPABILITIES_TTL` seconds, 300 by
  default. A restart clears it, so the new server's layers appear immediately.
- Layer names are workspace-qualified, for example
  `Hazards_Dashboard:TanaRiver_Slope`. A different GeoServer with different
  workspace names serves different layer ids, and saved configurations that
  name the old ids will not resolve. The backend refuses to serve a layer name
  it has not seen in capabilities, so this shows up as a clear error rather than
  a blank tile.

---

## What to back up

One volume matters:

| volume | holds | lose it and |
| --- | --- | --- |
| `rangeland_backend-data` | the SQLite database: runs, stages, results | analysis history is gone |
| `rangeland_backend-workspace` | fetched coverages, computed GeoTIFFs | re-run to regenerate, no records lost |

Back up the database volume by copying the file out of the running container:

```bash
mkdir -p backups
docker compose exec -T backend \
  python3 -c "import shutil,sys; shutil.copyfileobj(open('/data/db.sqlite3','rb'), sys.stdout.buffer)" \
  > backups/db-$(date +%F).sqlite3
```

Reading the file while the service is running can catch a write in progress. For
a backup you can rely on, stop the backend first:

```bash
docker compose stop backend
docker run --rm -v rangeland_backend-data:/data -v "$PWD/backups:/backup" \
  alpine tar czf /backup/backend-data-$(date +%F).tar.gz -C /data .
docker compose start backend
```

Restore the same way, in reverse:

```bash
docker compose stop backend
docker run --rm -v rangeland_backend-data:/data -v "$PWD/backups:/backup" \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/backend-data-2026-09-22.tar.gz -C /data"
docker compose start backend
```

The volume names are prefixed with the compose project name, which is
`rangeland` (set by the `name:` key at the top of `docker-compose.yml`). Confirm
them with `docker volume ls`.

Also back up `.env`, somewhere that is not this repository. It holds the secret
key and any GeoServer credentials, it is gitignored on purpose, and it is the
one file you cannot regenerate.

`backend-workspace` does not need backing up. It is GeoTIFF scratch, hundreds of
megabytes per run, and losing it costs a re-run rather than a record.

---

## Upgrading to a new version of the code

```bash
git pull
docker compose up --build -d
```

Migrations run automatically at backend startup, every time. They are
idempotent, so a version with no new migration costs nothing.

Rebuild `web` whenever any `NEXT_PUBLIC_*` value changes, not just when the code
does. That is the build-time inlining again.

To roll back, check out the previous commit or tag and run the same two
commands. Set `APP_VERSION` in `.env` to a git short sha or a release tag and
both images are tagged with it, which makes "which version is actually running"
answerable from `docker compose ps` and from `/api/health`.

---

## Troubleshooting

### The map is blank

The most common failure, and it has five distinct causes that all look
identical on screen. Work down the list in order; each step rules out one cause.

**1. Is GeoServer reachable from the backend?**

```bash
curl -sS http://localhost:8000/api/v1/health
```

`geoserver.reachable: false` means the backend cannot reach GeoServer. Read
`detail`: a timeout is a network or firewall problem, a 401 means
`GEOSERVER_USER` and `GEOSERVER_PASSWORD` are wrong or missing, and a 404 means
`GEOSERVER_URL` has the wrong path (it should end in `/geoserver`, with no
trailing slash). Check `geoserver.endpoint` in the same response to be sure the
backend is using the URL you think it is.

**2. Can the analyst's browser reach the backend at all?**

This is the cause that survives every server-side check, so test it from the
analyst's machine, not the server. Open the developer tools, reload the page,
and look at the network tab for requests to `/api/v1/tiles/`.

- Requests going to a hostname like `backend:8000`, or to `127.0.0.1:8000` on a
  machine that is not the server: `NEXT_PUBLIC_BACKEND_URL` was wrong at build
  time. Fix `.env`, then **rebuild**:
  ```bash
  docker compose build web && docker compose up -d web
  ```
  A restart alone will not fix this. The wrong value is inside the JavaScript.
- Requests failing with a CORS error: the app's origin is not in
  `CORS_ALLOWED_ORIGINS`. It must match scheme, host and port exactly.
  `http://localhost:3000` and `http://127.0.0.1:3000` are different origins to a
  browser, and both are different from `https://...`. Fix `.env` and
  `docker compose up -d backend`.
- No tile requests in the network tab at all: the problem is earlier than the
  map. Check the browser console for a JavaScript error and check
  `docker compose logs web`.

**3. Are the tiles 400ing with an invalid host?**

```bash
docker compose logs backend | grep -i "invalid http_host"
```

Any hit means `DJANGO_ALLOWED_HOSTS` is missing the hostname the request arrived
with. Add it, including `backend` for the internal calls, and restart the
backend.

**4. Does the layer exist on this GeoServer?**

```bash
curl -sS http://localhost:8000/api/v1/layers | head -c 2000
```

An empty list with a healthy GeoServer means the catalogue has no layers the
backend can see, usually because you are pointed at the wrong server or the
layers are in a workspace that was renamed. Layer ids are workspace-qualified,
and a name the backend has not seen in capabilities is refused rather than
proxied into a blank tile.

**5. Is it the basemap rather than the data?**

The basemaps come from `tile.openstreetmap.org`, `server.arcgisonline.com` and
`gibs.earthdata.nasa.gov`, directly from the analyst's browser. On a network
with no outbound internet access those will not load even when everything in
this deployment is perfect. The symptom is a grey background with the data
layers drawn correctly on top of it, which is different from a fully blank map.

### `docker compose up` exits immediately with a message about a variable

Working as designed. Every required variable is declared with no default, so a
missing one stops the deployment with the variable's name and a hint instead of
booting something insecure. Read the message, set that variable in `.env`, run
it again.

### The backend never becomes healthy

```bash
docker compose logs backend
```

- `FileNotFoundError` mentioning `contracts/criteria.json` at startup: the image
  was built without the `contracts/` directory. Build from the repository root
  (`docker compose build`), not from inside `services/`.
- A permission error on `/data/db.sqlite3`: the volume was created before the
  image set up its unprivileged user. Recreate it with
  `docker compose down -v` (this deletes the database) and `docker compose up -d`.
- Nothing in the log and the healthcheck timing out: the backend's health
  endpoint probes GeoServer before answering and waits up to `GEOSERVER_TIMEOUT`
  (30 seconds) when GeoServer is off the network. The container healthcheck
  allows 40 seconds for exactly this reason, so the container should still go
  healthy with `status: degraded`. If you lowered the timeout or raised
  `GEOSERVER_TIMEOUT` past 40 seconds, put them back in that order.

### The app starts before the backend is ready

It should not: `depends_on` uses `condition: service_healthy`. If you see it
happen, check that the backend image actually carries its `HEALTHCHECK`
(`docker inspect --format '{{json .Config.Healthcheck}}' rangeland-backend:dev`)
and that you are on Compose v2.

### A run starts and then stops reporting progress

Runs execute on a background thread inside the gunicorn worker process. If the
container restarts mid-run, the run's row stays in the database with its last
recorded stage and never advances. Start it again. Do not raise
`GUNICORN_WORKERS` above 1 while the database is SQLite: more worker processes
means more writers competing for one file and "database is locked" errors during
a run.

### Disk filling up

`backend-workspace` grows by the size of the rasters each run touches, and
nothing prunes it automatically.

```bash
docker compose exec backend du -sh /workspace
docker compose exec backend sh -c "ls -1t /workspace | tail -n +20"   # oldest runs
```

Delete old run directories by name. They are named after the run id, and
removing one costs a re-run of that analysis, not a record.

---

## What this deployment does not include

Named so nobody assumes otherwise:

- **TLS.** Both services speak plain HTTP. Put a reverse proxy (nginx, Caddy,
  Traefik) in front for anything beyond a trusted LAN, terminate TLS there, and
  set `NEXT_PUBLIC_BACKEND_URL` and `CORS_ALLOWED_ORIGINS` to the `https://`
  addresses.
- **Authentication on the backend.** `services/backend` has no accounts, no
  sessions and no API keys. Anyone who can reach port 8000 can start a run.
  While it is bound to `0.0.0.0` it is open to every machine that can route to
  the host. Set `BACKEND_BIND=127.0.0.1` and proxy it, or keep it on a private
  network.
- **A Content-Security-Policy.** The app ships `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` and a
  `frame-ancestors 'none'` policy. A full CSP is not shipped because it would
  have to enumerate the tile hosts (`tile.openstreetmap.org`,
  `server.arcgisonline.com`, `gibs.earthdata.nasa.gov`), whatever
  `NEXT_PUBLIC_BACKEND_URL` is set to, and a `script-src` that Next's hydration
  accepts, and a wrong one blanks the map with the reason visible only in a
  console. Adding it is a change to test against a running deployment, not to
  guess at. `my-app/next.config.ts` has the source list.
- **Postgres.** SQLite is the default and is honest for one analyst on one
  machine. Set `DATABASE_URL` to a `postgres://` URL and add the service;
  `services/backend/rangeland/settings.py` switches on the scheme with no code
  change.
- **Horizontal scaling.** One backend replica, one gunicorn worker. Runs live on
  a thread in that process. Scaling out means moving the runner out of process
  first, and the seam for that is `services/backend/apps/analysis/jobs/runner.py`.
- **GeoServer itself.** Deployed, backed up and upgraded by whoever owns it.

---

## Reference: every variable

`.env.example` is the authority and carries a line for each one saying what
breaks when it is wrong. The summary:

| variable | required | changing it means |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | yes | restart |
| `DJANGO_ALLOWED_HOSTS` | yes | restart |
| `CORS_ALLOWED_ORIGINS` | yes | restart |
| `NEXT_PUBLIC_BACKEND_URL` | yes | **rebuild `web`** |
| `GEOSERVER_URL` | yes | restart |
| `GEOSERVER_USER`, `GEOSERVER_PASSWORD` | no | restart |
| `GEOSERVER_TIMEOUT`, `GEOSERVER_COVERAGE_TIMEOUT`, `GEOSERVER_CAPABILITIES_TTL` | no | restart |
| `WEB_PORT`, `BACKEND_PORT`, `WEB_BIND`, `BACKEND_BIND` | no | recreate (`up -d`) |
| `APP_VERSION` | no | rebuild to retag |
| `DATABASE_URL` | no | restart |
| `GUNICORN_WORKERS`, `GUNICORN_THREADS`, `LOG_LEVEL` | no | restart |
| `NEXT_PUBLIC_WMS_SOURCE`, `NEXT_PUBLIC_WMS_ENDPOINT` | no | **rebuild `web`** |

`DJANGO_DEBUG` is not in that table on purpose. It is hardcoded to `0` in
`docker-compose.yml`, because a debug switch that can be flipped by exporting a
variable is one typo away from serving stack traces and settings to whoever
asks.
