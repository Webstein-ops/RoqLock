# RoqLock frontend

Standalone React/Vite frontend for the RoqLock API.

## Local development

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local`. The backend runs at `http://127.0.0.1:3000` by default. For a deployed frontend, set `VITE_API_URL` to the publicly accessible backend URL at build time.
3. Run `npm install`.
4. Run `npm run dev` and open the local URL printed by Vite (normally `http://localhost:5173`).

Run the backend separately from the sibling `roqlock-backend` project. Its `CORS_ORIGIN` must allow the frontend's origin, and its `PUBLIC_APP_URL` must match the frontend URL for generated deal links.

## Build and deploy

Run `npm run build` to create the static site in `dist/`. For a Vercel project, use the `frontend/` directory as its Root Directory, the Vite framework preset, and set these build environment variables:

- `VITE_API_URL=https://roqlock-backend.vercel.app`
- `VITE_DEMO_MODE=true` for the judge demo (checkout and release are simulations only; no money moves)

The backend must allow the deployed frontend origin in `CORS_ORIGIN` and use it as `PUBLIC_APP_URL` so API calls work and shared deal links point to the frontend.

The app can run in demo mode with `VITE_DEMO_MODE=true`. Demo checkout and release are simulations only: no payment is processed and no escrow funds move. Roqqu is currently unavailable, so make that clear to judges. Set `VITE_DEMO_MODE=false` only when using the real Base Sepolia wallet flow. The contract ABIs are bundled from `abi/`; no signing keys or backend secrets belong in frontend environment variables.
