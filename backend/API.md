# RoqLock API contract for the frontend

Base URL: `http://127.0.0.1:4000`. JSON APIs return `{ error }` for failures. Send the JWT returned from registration/login as `Authorization: Bearer <token>`.

## Authentication and wallet linking

- `POST /api/auth/register` — body: `{ "email", "password", "displayName", "role": "SELLER" | "BUYER" }`; password minimum 12 characters. Returns `{ user, token }`.
- `POST /api/auth/login` — body: `{ "email", "password" }`; returns `{ user, token }`.
- `GET /api/auth/me` or `GET /api/users/me` — current user.
- `PATCH /api/users/me` — body: `{ "displayName" }`.
- `POST /api/users/me/wallet-challenge` — authenticated body `{ "address": "0x…" }`; sign the returned `message` with `personal_sign`.
- `POST /api/users/me/wallet-verify` — authenticated body `{ "address": "0x…", "signature": "0x…" }`; links the wallet only after signature recovery succeeds.

## Deals

- `POST /api/deals` — SELLER JWT required. Body:

```json
{
  "title": "Phone sale",
  "description": "Agreed model and condition",
  "amountUsdc": "120.50",
  "sellerWalletAddress": "0x…",
  "buyerEmail": "buyer@example.com",
  "deliveryMethod": "Courier",
  "expectedDeliveryAt": "2026-11-10T12:00:00.000Z",
  "conditions": "Buyer confirms delivery before release"
}
```

The seller must first verify their wallet via the wallet challenge routes; `sellerWalletAddress` must match that linked wallet. The response contains `deal`, `publicUrl`, and `deal.escrowDealId` (bytes32). The public URL is a secret bearer link; only its hash is stored. Amounts accept up to 6 fractional digits and are returned as decimal USDC strings.

- `GET /api/deals` — current seller's deals.
- `GET /api/deals/buyer` — current BUYER account's linked deals.
- `GET /api/deals/:id` — current seller's deal.
- `PATCH /api/deals/:id` — edit terms only while status is `CREATED`; amount and seller wallet cannot be changed.
- `POST /api/deals/:id/share-link` — seller rotates the public link; previous link stops working.
- `POST /api/deals/:id/shipping` — SELLER JWT; body `{ "trackingRef?", "method?", "note?" }`; allowed after funds are secured.
- `GET /api/deals/public/:token` — public terms, current status, seller display name, and latest delivery update. Buyer email/wallet and token hash are omitted.

## Base Sepolia escrow flow

The frontend connects the buyer's wallet to Base Sepolia (`chainId: 84532`) and uses `abi/MockUSDC.json` and `abi/RoqLockEscrow.json`.

1. Call MockUSDC `approve(escrowAddress, amountMinor)` where `amountMinor = amountUsdc × 1,000,000` exactly.
2. Call escrow `createAndFundEscrow(deal.escrowDealId, deal.sellerWalletAddress, amountMinor)` from the buyer wallet.
3. After receipt inclusion, POST `{ "transactionHash": "0x…" }` to `/api/transactions/public/:token/funding/verify`.
4. The backend checks chain ID, successful receipt, configured confirmation depth, an `EscrowCreated` log emitted by the escrow address, exact deal ID/seller/amount, and the escrow mapping status before setting `FUNDS_SECURED`.
5. Seller posts delivery through `/api/deals/:id/shipping`.
6. Buyer calls escrow `releaseFunds(dealId)` directly. Post its hash to `/api/transactions/public/:token/release/verify`; backend independently checks `FundsReleased` and on-chain `Released` status before setting `COMPLETED`.

The deployed contract permits the buyer to call `releaseFunds` any time the escrow is `Funded`; it does not enforce a shipped/delivery gate. The frontend should only offer the normal release action after shipping, but the backend cannot prevent a buyer from calling the contract early. If that happens, the backend records the confirmed on-chain release as completed and notes the missing shipped status in history.

Disputes are also direct wallet calls: a party calls `raiseDispute(dealId)` and then posts the hash plus a description to `/api/transactions/public/:token/disputes/verify` with a JWT whose wallet was verified and matches `raisedBy`. The arbitrator calls `resolveDispute(dealId, buyerAmount, sellerAmount)` and posts the hash to `/api/transactions/public/:token/disputes/resolve/verify`. The contract authorizes these operations; the backend only records confirmed results. Resolution status is `REFUNDED`, `COMPLETED`, or `RESOLVED` for a split.

The direct wallet flow uses the deployed MockUSDC for testnet. The backend never holds a wallet signing key and never submits buyer/arbitrator transactions.

The deployed MockUSDC has no faucet; its constructor minted the initial supply to the deployment wallet. Read-only Base Sepolia calls confirm the escrow owner and arbitrator are both `0x48fa772d57f59ce3f49d2be963a1a18666c10e36`, and the escrow's `usdc()` is the supplied MockUSDC address. Fund the buyer's test wallet from the deployment wallet before running the frontend flow. That deployment wallet must also sign arbitrator resolutions.

## Other routes

- `GET /api/payments/roqqu/supported-networks` — public Roqqu payment-link network list.
- `GET /api/payments/public/:token/roqqu/transactions/:hash` — query Roqqu transaction status; this does not secure escrow funds.
- `POST /api/payments/public/:token/simulator` — development/test only; creates a local simulated checkout session.
- `GET /api/payments/public/:token/simulator/:paymentId` — read the simulated session status.
- `POST /api/payments/public/:token/simulator/:paymentId/complete` or `/fail` — simulate the checkout result.
- `POST /api/webhooks/roqqu` — accepts the encrypted RAS callback (`hash` JSON field and documented `x-api-key` IV header), decrypts it, and deduplicates by event ID. A callback alone never changes deal or payment status.
- `GET /api/disputes` and `POST /api/disputes/:id/evidence` — authenticated dispute list and secure evidence storage key references. Upload files to approved object storage first; this API does not accept file bytes.
- `GET /api/notifications`, `PATCH /api/notifications/:id/read` — in-app notification records.
- `GET /health` — readiness check including local file storage; returns `503` when storage is unavailable.
- `GET /health/live` — process liveness check.

## Roqqu status

Current RAS test API auth is `x-staging-api-key`; the test private and public strings supplied in chat were rejected by Roqqu's read-only `POST /wallets/get-all-networks` endpoint. The private candidate was also rejected with `x-api-key`. No payment request was made. Roqqu's public payment-link supported-networks endpoint currently returns Bitcoin/BTC, TRC20/USDT, and BEP20/USDT, which cannot fund this Base Sepolia contract. The newer API overview lists Base/USDC, but does not establish Base Sepolia support. Use the direct Base Sepolia wallet flow above for frontend integration.

## Local run steps

1. Copy `.env.example` to `.env`; set a unique JWT secret, frontend origin, RPC URL, and persistent `DATA_FILE` path.
2. `npm install`
3. `npm run dev`

The frontend should call this API and must not write the backend data file. Configure `CORS_ORIGIN` to the exact frontend origin. Store the JWT securely and send it as a bearer token for authenticated routes. Treat the public deal token as a secret link; the seller can rotate it, which invalidates the previous link. Run one backend instance against the file store.

For local checkout simulation, set `PAYMENT_SIMULATOR_ENABLED=true` in development. The simulator is disabled whenever `NODE_ENV=production`. A simulated paid result only changes the simulator's payment record; it does not change the deal status, create a blockchain transaction, or represent money received. Show a clear test-mode label in the UI.

Roqqu test keys are optional. Configure a valid Roqqu test API key only if calling its status API or decrypting callbacks. Never use the live key in development.
