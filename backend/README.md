# RoqLock backend

Backend for RoqLock using Fastify and JavaScript. Records are persisted in a local JSON file; no database server is required.

Frontend integration and the Base Sepolia transaction flow are documented in [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) and [API.md](./API.md).

For a Vercel Preview demo, follow [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md). Its `/tmp` storage is temporary and demo-only.

## Current scope

- Seller/buyer registration and login with Argon2id password hashes and short-lived JWTs.
- Deal creation, seller-owned deal listing/detail/update, and public deal lookup.
- Public link secrets are generated with a cryptographic RNG; only SHA-256 hashes are stored.
- Deal amounts are stored as integer USDC base units (6 decimals), never floating point.
- Contract and Roqqu settings are environment-based; no signing key is part of this application.

Escrow funding, release, and dispute outcomes are verified against the deployed Base Sepolia contract. The buyer's wallet approves USDC and calls `createAndFundEscrow`; this contract is not a custodial payment-forwarding contract. Roqqu callbacks are recorded for audit, but cannot mark funds secured.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set a unique `JWT_SECRET` of at least 32 characters.
3. Install dependencies with `npm install`.
4. Start the API with `npm run dev`.

The data file is created at `DATA_FILE` (default `./data/roqlock.json`). Keep it on persistent disk and back it up. Use one backend process; this local file store is not suitable for multi-instance deployments or high-volume concurrent writes.

The API listens on `http://127.0.0.1:4000` by default. `PUBLIC_APP_URL` is the frontend origin used to construct share links, and `CORS_ORIGIN` accepts a comma-separated origin allowlist.

## API implemented

- `POST /api/auth/register` — create a SELLER or BUYER account.
- `POST /api/auth/login` — return an access token.
- `GET /api/auth/me` — authenticated profile.
- `GET /api/users/me` — authenticated profile.
- `PATCH /api/users/me` — update the display name; link the wallet through the signed challenge routes.
- `POST /api/deals` — authenticated sellers create a USDC deal.
- `GET /api/deals` — list the authenticated seller's deals.
- `GET /api/deals/:id` — retrieve an owned deal.
- `PATCH /api/deals/:id` — edit allowed terms while status remains CREATED.
- `GET /api/deals/public/:token` — public read-only deal view.
- `GET /health` — readiness, including access to the local data file.
- `GET /health/live` — process liveness.

Amounts use decimal USDC strings in requests and responses, with up to six fractional digits.

## Contract mapping

Base Sepolia (chain ID 84532) uses the deployment addresses in `.env.example`. The inspected Solidity/ABI exposes `createAndFundEscrow`, `releaseFunds`, `raiseDispute`, `resolveDispute`, `getEscrow`, and events `EscrowCreated`, `FundsReleased`, `DisputeRaised`, and `DisputeResolved`. On-chain states are `None`, `Funded`, `Disputed`, `Released`, and `Resolved`. The backend will only derive secured/released states from confirmed chain state/events.

## Integration findings

- The supplied contract's funding call must be sent by the buyer after USDC approval. The contract does not expose an operator/custodian funding method.
- Current RAS docs expose a transaction-status endpoint and encrypted AES-256-CTR webhooks. Roqqu payment links list Bitcoin/BTC, TRC20/USDT, and BEP20/USDT; the RAS overview separately lists Base/USDC, which is Base mainnet and does not match the supplied Base Sepolia deployment.
- The supplied test private and public strings were each rejected as invalid when tested with the documented `x-staging-api-key` header on the read-only network-config endpoint. No payment or transfer request was made. Until a valid test API key and compatible test network are available, the correct test flow is a buyer wallet directly funding the existing Base Sepolia contract with MockUSDC.
