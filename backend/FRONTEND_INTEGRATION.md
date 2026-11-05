# Frontend integration guide

## Configure the app

- Local API URL: `http://127.0.0.1:4000` (set the deployed API URL per environment).
- Base Sepolia chain ID: `84532`.
- Escrow: `0x30315c49b2ACfa541E09FfAA181C29547DF39de3`.
- Test USDC: `0x958F019a07B239695E8aD350539d5B70A63Ef841` (6 decimals).
- Contract ABIs: `abi/RoqLockEscrow.json` and `abi/MockUSDC.json`.
- Set backend `CORS_ORIGIN` to the frontend origin. The backend stores records in its own local JSON file; the frontend should only use the API and should not write that file.

## Authentication and wallet linking

Register with `POST /api/auth/register` using `{ email, password, displayName, role }`, where role is `SELLER` or `BUYER`. Login with `POST /api/auth/login` using `{ email, password }`. Both return `{ user, token }`. Send the token as `Authorization: Bearer <token>` on authenticated routes.

Before creating a deal, the seller proves wallet ownership:

1. `POST /api/users/me/wallet-challenge` with `{ address }`.
2. Sign the returned `message` with the connected wallet's `personal_sign` method.
3. `POST /api/users/me/wallet-verify` with `{ address, signature }`.

Keep the token in the frontend's chosen secure session storage. Never ask the backend for a user's wallet private key.

## Create and fund a deal

1. Seller calls `POST /api/deals` with a bearer token and fields `title`, `description`, `amountUsdc` (decimal string), and `sellerWalletAddress` (must match the verified wallet). Optional fields: `buyerEmail`, `buyerWalletAddress`, `deliveryMethod`, `expectedDeliveryAt`, and `conditions`.
2. Keep the returned `publicUrl` secret and share it with the buyer. Its token is the `:token` used by public verification routes. The response also contains `deal.escrowDealId` (bytes32). Amounts have at most six decimal places.
3. Buyer opens `GET /api/deals/public/:token`, connects a Base Sepolia wallet, and requests test USDC if needed from the deployment wallet.
4. Convert the decimal amount to base units exactly (USDC times 1,000,000). From the buyer wallet, call MockUSDC `approve(escrowAddress, amountMinor)`, then escrow `createAndFundEscrow(deal.escrowDealId, deal.sellerWalletAddress, amountMinor)`.
5. After the funding transaction is mined, call `POST /api/transactions/public/:token/funding/verify` with `{ transactionHash }`. The backend verifies the receipt, confirmations, event, deal ID, amount, seller, and current contract state before marking funds secured.

## Local checkout simulation while Roqqu is unavailable

This is a local backend simulator for connecting and demonstrating checkout UI. It is not a Roqqu integration, payment processor, or substitute for a real escrow transaction. Set `PAYMENT_SIMULATOR_ENABLED=true` in the backend `.env` for development. It is disabled whenever `NODE_ENV=production`, even if the flag is accidentally left on.

1. Start a session with `POST /api/payments/public/:token/simulator`. The token comes from the seller's `publicUrl`.
2. The response includes the payment ID, amount, current status, and action URLs. The new session starts as `SIMULATED_PENDING`.
3. Poll the returned status URL. In development only, POST to the `complete` or `fail` action to exercise success or failure UI.
4. Show a visible "Simulation" or "Test payment" label. The response includes `simulated: true`, `escrowFunded: false`, and a message confirming that no money moved.

Example response (IDs and timestamps shortened):

```json
{
  "payment": { "id": "<session-id>", "status": "SIMULATED_PENDING", "amountUsdc": "25.00", "currency": "USDC", "createdAt": "<timestamp>" },
  "simulated": true,
  "escrowFunded": false,
  "dealStatus": "CREATED",
  "message": "Simulation only. No money moved and no on-chain escrow was funded.",
  "actions": {
    "complete": "/api/payments/public/<token>/simulator/<session-id>/complete",
    "fail": "/api/payments/public/<token>/simulator/<session-id>/fail",
    "status": "/api/payments/public/<token>/simulator/<session-id>"
  }
}
```

Example:

```js
const session = await api(`/api/payments/public/${token}/simulator`, {
  method: "POST",
});

// Render a pending checkout state, then simulate either outcome in development.
const result = await api(session.actions.complete, { method: "POST" });
// result.payment.status === "SIMULATED_PAID"
// result.simulated === true; result.escrowFunded === false
```

A simulated payment changes only the local payment record. It does not change the deal from `CREATED`, create a blockchain transaction, notify Roqqu, or prove that funds were received. Do not show it as real payment confirmation. For real testnet escrow funding, use the buyer wallet flow above.

The simulator returns `404` when it is disabled or the deal/session link is invalid. It returns `409` if a session is already final or the deal is no longer new.

Example request helper:

```js
async function api(path, { token, method = "GET", body } = {}) {
  const url = path.startsWith("http") ? path : `${API_URL.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}
```

## Delivery, release, and disputes

- Seller records shipment with `POST /api/deals/:id/shipping` and a bearer token. Body fields are optional: `trackingRef`, `method`, `note`.
- Buyer normally releases only after delivery: call escrow `releaseFunds(dealId)` from the buyer wallet, then `POST /api/transactions/public/:token/release/verify` with `{ transactionHash }`.
- Buyer or seller raises a dispute on-chain with `raiseDispute(dealId)`, then posts `{ transactionHash, description }` to `/api/transactions/public/:token/disputes/verify` with a bearer token whose verified wallet matches the on-chain party.
- The arbitrator resolves on-chain with `resolveDispute(dealId, buyerAmount, sellerAmount)`, then posts `{ transactionHash }` to `/api/transactions/public/:token/disputes/resolve/verify`.

The deployed contract does not enforce a shipment gate; a buyer can call release while funds are still `Funded`. Hide the release action until shipping is recorded. The backend reports confirmed on-chain truth even if the buyer calls early.

## Useful routes

- Seller deals: `GET /api/deals`; deal detail/update: `GET` or `PATCH /api/deals/:id`.
- Buyer deals: `GET /api/deals/buyer` (BUYER account and bearer token required).
- Public deal: `GET /api/deals/public/:token`.
- Rotate share URL: `POST /api/deals/:id/share-link` (old URL stops working).
- Notifications: `GET /api/notifications`; mark read with `PATCH /api/notifications/:id/read`.
- Readiness check (includes local storage): `GET /health`; process liveness: `GET /health/live`.

Contract confirmations default to two and can be changed with `MIN_CHAIN_CONFIRMATIONS`. Roqqu payment-link callbacks do not secure escrow funds; the testnet integration is the direct wallet flow above.
