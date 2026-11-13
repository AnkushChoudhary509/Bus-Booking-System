# RouteAura: Intelligent Bus Travel & Journey Experience Platform

MERN app: React + Vite + Tailwind (frontend), Express + Mongoose + Socket.IO (backend), MongoDB local or Atlas.

## Run locally (Windows PowerShell + VS Code)

Prerequisites: Node 20+, MongoDB Community Server running locally.

**Terminal 1: backend**
```powershell
cd backend
npm install
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # paste into JWT_SECRET in .env
npm run seed      # loads demo data (wipes the database!)
npm run dev       # http://localhost:5000  (health: /health)
```
**Terminal 2: frontend**
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev       # http://localhost:5173
```
**Terminal 3 (optional): tests**: `cd backend; npm test` (downloads an in-memory MongoDB on first run)

## Demo accounts (DEVELOPMENT ONLY, password `Demo@12345`)
| Role | Email |
|---|---|
| Admin | admin@routeaura.test |
| Operator (approved) | operator@routeaura.test |
| Operator (pending approval) | pending.operator@routeaura.test |
| Passenger | passenger@routeaura.test |

The seeder refuses to run when `NODE_ENV=production`. Never use these accounts on a real deployment.

## Database: local or Atlas
`backend/.env`: `DB_MODE=local` uses `MONGODB_LOCAL_URI`; `DB_MODE=atlas` uses `MONGODB_URI`. No code change needed.

## Payments
`PAYMENT_MODE=mock` (default): built-in demo gateway, no real money. `PAYMENT_MODE=razorpay`: set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (test keys) in the backend and `VITE_RAZORPAY_KEY_ID` in the frontend. The server verifies the HMAC signature; the frontend result is never trusted.

## Deploy
1. **Atlas**: create a free cluster, a database user, and Network Access allowing `0.0.0.0/0` (Render IPs change). Copy the connection string (`mongodb+srv://...`).
2. **Render (backend)**: New Web Service from your GitHub repo, root directory `backend`, build `npm install`, start `npm start`, health check `/health`. (Or use `render.yaml`.) Env vars: `NODE_ENV=production`, `DB_MODE=atlas`, `MONGODB_URI`, `JWT_SECRET` (long random), `CLIENT_URL` (your Vercel URL, no trailing slash), `PAYMENT_MODE`, optional Razorpay/email keys.
3. **Seed Atlas once** from your PC: set `MONGODB_URI` + `DB_MODE=atlas` in a local `.env`, then `SEED_ALLOW_PRODUCTION=true npm run seed` (PowerShell: `$env:SEED_ALLOW_PRODUCTION="true"; npm run seed`). Skip if you want an empty production DB.
4. **Vercel (frontend)**: import the repo, root directory `frontend`, framework Vite. Env vars: `VITE_API_URL=https://<your-render-app>.onrender.com/api/v1`, `VITE_SOCKET_URL=https://<your-render-app>.onrender.com`, optional `VITE_SHOW_DEMO=true` for an evaluation demo. `vercel.json` already handles SPA routing.
5. Put the final Vercel URL into Render's `CLIENT_URL` and redeploy. Render's free tier sleeps when idle, so the first request can take ~50 s.

## Tracking map and simulation
- The tracking page draws the **real road route** between the two cities (fetched once from OpenStreetMap's free OSRM service by the backend, then cached in MongoDB) and a **simulated bus marker** that moves along it as the journey progresses.
- Admin dashboard, Journeys tab: **Auto-run** drives the whole trip (about 100 seconds), **10%** steps it manually, **Delay** and **Reset** work as before. Keep the admin page open while Auto-run is going. Passengers watching the tracking page see the bus move.
- If the backend has no internet access to OSRM, a dashed straight line is shown instead and the page says so. Optional env vars: `OSRM_URL` (your own OSRM server), `OSRM_TIMEOUT_MS`.
- OSRM's public demo server is for light use only. The position is always simulated, never live GPS.

### Optional: live GPS driver mode

Besides the simulation, a driver can share a **real GPS position** from a phone.

1. Log in as an operator (or admin) on the phone and open **Operator > Journeys > Driver mode (GPS)** for the trip.
2. Tap **Start sharing** and allow location. The phone sends a position every ~5 s (`POST /api/v1/journeys/:id/location`).
3. The server snaps the position onto the road line to compute progress, so the progress bar, ETA and "stops passed" follow the real bus. Passengers see the badge **LIVE GPS** instead of **SIMULATED position**.
4. Tap **Stop sharing**, or just close the page: if no fix arrives for 2 minutes tracking falls back to the simulation automatically.

Notes:
- Phones only allow GPS on **HTTPS** (your deployed Vercel site) or `localhost`. On plain `http://192.168.x.x` the browser will refuse. For local phone tests, use the deployed site.
- Keep the screen on (the page requests a wake lock where supported); browsers pause GPS in background tabs.
- No moving phone? Use **Test position (manual)** on the driver page to send a hand-typed coordinate.
- Accuracy depends on the phone and signal. Positions far from the road show an off-route warning.
- Verified here with a mocked geolocation in a browser; real-device behaviour and the backend endpoint's database tests (`tests/gps.test.js`) need to be run on your machine.

### Adding your own routes and buses

- **Any city:** operators (Journeys > Create journey > New route) and admins (Admin > Buses & routes > Add route) can create a route between any two places, not only the seeded cities. Use **Find** to look a place up on OpenStreetMap, or enter latitude/longitude by hand. Distance and duration can be left blank; the server estimates them from the road route (or a straight-line estimate, which it says so).
- **Stops on the way:** optional name + minutes after departure. They are placed on the map by time and only turn green when the bus has really passed them.
- **Buses:** operators add buses under Buses (free-text name and registration). Admins can add a bus on behalf of any approved operator in Admin > Buses & routes > Add bus.
- A route without coordinates still works for booking but has no tracking map (the Admin table shows "No coords").
- Place lookup needs internet from the backend (`GEOCODE_URL` can point at another Nominatim server).

### Instant updates across admin, operator and passenger screens

When anyone adds or changes a route, bus, journey or operator, the backend announces `catalog:update` over Socket.IO (only the entity name, no data). Every open screen refetches its own lists through the normal API within about half a second: the passenger city suggestions and search, the operator's routes, buses and journeys, and the admin tables. No page reload is needed. If the socket cannot connect (for example a firewall), lists still refresh when you reopen the page.

### When are stops shown as passed (no fake progress)?

A stop turns green only from real evidence: the simulation (admin buttons) or a **verified live GPS fix**. A GPS fix counts only if it is within 15 km of the road line and its accuracy is better than 1.5 km. A position elsewhere (for example a laptop in another city) is shown on the map as "LIVE GPS (off route)" but gives no progress and does not start the trip. Progress never moves backwards, and if the GPS signal is lost the last verified progress is kept ("GPS lost") until an admin presses Reset.

## Honest notes
- Seat comfort, vibration, reliability and tracking are **estimated / sample / simulated** and labelled so in the UI. There is no real GPS.
- Admin "Simulation" drives demo journey progress and pushes live updates over Socket.IO.
- Sockets are optional: pages poll as a fallback.
