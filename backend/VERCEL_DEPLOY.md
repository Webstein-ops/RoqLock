# Vercel MVP deployment

The existing repository also contains the Hardhat contract project. Deploy only the backend subdirectory.

## Import the project

1. In Vercel, import `Webstein-ops/RoqLock`.
2. Select branch `codex/backend-local-simulator`.
3. Set **Root Directory** to `backend`.
4. Leave Framework Preset and build settings on automatic detection. Vercel recognizes this Fastify server and deploys it as one Node.js Function.
5. Add the Preview environment variables below, then deploy a Preview. Do not use Production for the first integration demo.

## Preview environment variables

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
DATA_FILE=/tmp/roqlock.json
PAYMENT_SIMULATOR_ENABLED=true
JWT_SECRET=<generate a unique random value of at least 32 characters>
PUBLIC_APP_URL=<frontend preview URL>
CORS_ORIGIN=<frontend preview origin>
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_CHAIN_ID=84532
ROQLOCK_ESCROW_ADDRESS=0x30315c49b2ACfa541E09FfAA181C29547DF39de3
MOCK_USDC_ADDRESS=0x958F019a07B239695E8aD3505399d5B70A63Ef841
MIN_CHAIN_CONFIRMATIONS=2
```

Vercel sets `VERCEL_ENV=preview` for Preview deployments; the local simulator is permitted there when its flag is enabled. It is forcibly disabled when `VERCEL_ENV=production`.

## MVP storage limitation

`DATA_FILE=/tmp/roqlock.json` lets the function write during a Preview demo. Vercel's function filesystem is temporary and isolated per function instance. Records can disappear after a cold start or be missing when a request reaches another instance. Use this only for disposable frontend demos with synthetic accounts and deals. Do not use it for real customers, production deals, or funds you cannot afford to lose. The durable production version needs persistent storage.

Vercel documents automatic Fastify deployment and the function runtime [here](https://vercel.com/kb/guide/ship-a-fastify-app-on-vercel), and explains that `/tmp` is temporary and function filesystems do not persist [here](https://vercel.com/academy/agent-friendly-apis/deploy-your-docs).

## Smoke-check the Preview

- `GET /health/live` should return `200`.
- `GET /health` should return `200` with `{"status":"ok","storage":"ok"}`.
- Register a synthetic seller, create a deal, then run the local simulator flow in [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md).
- Treat a simulated payment as a UI demo only; it does not move money or fund the Base Sepolia escrow.
