const localApiUrl = import.meta.env.DEV ? "http://127.0.0.1:3000" : "";
const API_URL = (import.meta.env.VITE_API_URL || localApiUrl).replace(/\/+$/, "");
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || "https://roqlock-frontend.vercel.app").replace(/\/+$/, "");
const DEMO_STORAGE_KEY = "roq_demo_data_v1";
const demoUser = {
  id: "roq-demo-seller",
  email: "demo@roqlock.local",
  displayName: "Demo Seller",
  role: "SELLER",
  walletAddress: null,
};

function readDemoData() {
  const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!raw) return { deals: [] };
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.deals)) throw new Error("Invalid demo data shape.");
    return data;
  } catch (error) {
    throw new Error(`Could not read the saved demo deals: ${error.message}`);
  }
}

function writeDemoData(data) {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    throw new Error(`Could not save this demo deal in your browser: ${error.message}`);
  }
}

function encodeDemoDeal(deal) {
  const shareableDeal = {
    id: deal.id,
    reference: deal.reference,
    title: deal.title,
    description: deal.description,
    amountUsdc: deal.amountUsdc,
    deliveryMethod: deal.deliveryMethod,
    expectedDeliveryAt: deal.expectedDeliveryAt,
    conditions: deal.conditions,
    status: deal.status,
    simulated: true,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    seller: { displayName: demoUser.displayName },
    deliveryUpdates: deal.deliveryUpdates || [],
    statusHistory: deal.statusHistory || [],
    publicToken: deal.publicToken,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(shareableDeal));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function importSharedDemoDeal(token, encodedDeal, data) {
  try {
    const base64 = encodedDeal.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const deal = JSON.parse(new TextDecoder().decode(bytes));
    if (
      deal.publicToken !== token ||
      deal.simulated !== true ||
      typeof deal.id !== "string" ||
      typeof deal.title !== "string" ||
      typeof deal.description !== "string" ||
      typeof deal.amountUsdc !== "string" ||
      !Array.isArray(deal.deliveryUpdates) ||
      !Array.isArray(deal.statusHistory)
    ) {
      throw new Error("The shared demo deal link is invalid.");
    }
    data.deals.unshift(deal);
    writeDemoData(data);
    return deal;
  } catch (error) {
    throw new Error(`Could not open the shared demo deal: ${error.message}`);
  }
}

function demoApi(path, { method = "GET", body, search = "" } = {}) {
  const data = readDemoData();
  const now = new Date().toISOString();
  const publicDealMatch = path.match(/^\/api\/deals\/public\/([a-f0-9]{64})$/i);
  if (path === "/api/auth/me") return { user: demoUser };
  if (path === "/api/notifications") return { notifications: [] };
  if (path === "/api/disputes") return { disputes: [] };
  if (path === "/api/deals" && method === "GET") return { deals: data.deals };

  if (path === "/api/deals" && method === "POST") {
    const tokenBytes = new Uint8Array(32);
    window.crypto.getRandomValues(tokenBytes);
    const publicToken = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const deal = {
      ...body,
      id: window.crypto.randomUUID(),
      reference: `RL-${window.crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      sellerId: demoUser.id,
      seller: { displayName: demoUser.displayName },
      status: "CREATED",
      simulated: true,
      createdAt: now,
      updatedAt: now,
      deliveryUpdates: [],
      statusHistory: [{ toStatus: "CREATED", createdAt: now }],
      publicToken,
      publicUrl: `${window.location.origin}/deal/${publicToken}`,
    };
    data.deals.unshift(deal);
    writeDemoData(data);
    return { deal, publicUrl: deal.publicUrl };
  }

  if (publicDealMatch && method === "GET") {
    const token = publicDealMatch[1];
    let deal = data.deals.find((item) => item.publicToken === token);
    const sharedDeal = new URLSearchParams(search).get("demo");
    if (!deal && sharedDeal) deal = importSharedDemoDeal(token, sharedDeal, data);
    if (!deal) throw new Error("This demo deal isn’t saved in this browser. Open the link in the browser where it was created.");
    return { deal };
  }

  const shareMatch = path.match(/^\/api\/deals\/([^/]+)\/share-link$/);
  if (shareMatch && method === "POST") {
    const deal = data.deals.find((item) => item.id === shareMatch[1]);
    if (!deal) throw new Error("This demo deal could not be found in this browser.");
    return { publicUrl: deal.publicUrl };
  }

  const shippingMatch = path.match(/^\/api\/deals\/([^/]+)\/shipping$/);
  if (shippingMatch && method === "POST") {
    const deal = data.deals.find((item) => item.id === shippingMatch[1]);
    if (!deal) throw new Error("This demo deal could not be found in this browser.");
    deal.status = "SHIPPED";
    deal.updatedAt = now;
    deal.deliveryUpdates = [{ id: window.crypto.randomUUID(), ...body, createdAt: now }];
    deal.statusHistory.push({ toStatus: "SHIPPED", createdAt: now });
    writeDemoData(data);
    return { deal };
  }

  const simulatorStart = path.match(/^\/api\/payments\/public\/([a-f0-9]{64})\/simulator$/i);
  if (simulatorStart && method === "POST") {
    const deal = data.deals.find((item) => item.publicToken === simulatorStart[1]);
    if (!deal) throw new Error("This demo deal could not be found in this browser.");
    return { payment: { id: window.crypto.randomUUID() }, actions: { complete: `/api/payments/public/${simulatorStart[1]}/simulator/complete` } };
  }

  const simulatorComplete = path.match(/^\/api\/payments\/public\/([a-f0-9]{64})\/simulator\/complete$/i);
  if (simulatorComplete && method === "POST") {
    const deal = data.deals.find((item) => item.publicToken === simulatorComplete[1]);
    if (!deal) throw new Error("This demo deal could not be found in this browser.");
    deal.status = "FUNDS_SECURED";
    deal.updatedAt = now;
    deal.statusHistory.push({ toStatus: "FUNDS_SECURED", createdAt: now });
    writeDemoData(data);
    return { message: "Demo payment complete. No money moved." };
  }

  const simulatorRelease = path.match(/^\/api\/payments\/public\/([a-f0-9]{64})\/simulator\/release$/i);
  if (simulatorRelease && method === "POST") {
    const deal = data.deals.find((item) => item.publicToken === simulatorRelease[1]);
    if (!deal) throw new Error("This demo deal could not be found in this browser.");
    deal.status = "COMPLETED";
    deal.updatedAt = now;
    deal.statusHistory.push({ toStatus: "COMPLETED", createdAt: now });
    writeDemoData(data);
    return { message: "Demo release complete. No money moved." };
  }

  const dealMatch = path.match(/^\/api\/deals\/([^/]+)$/);
  if (dealMatch && method === "GET") {
    const deal = data.deals.find((item) => item.id === dealMatch[1]);
    if (!deal) throw new Error("This demo deal could not be found in this browser.");
    return { deal };
  }
  throw new Error(`This action is not available in the local demo: ${method} ${path}`);
}

export async function api(path, { token, method = "GET", body } = {}) {
  if (DEMO_MODE) return demoApi(path, { method, body, search: window.location.search });
  if (!API_URL) {
    throw new Error("VITE_API_URL is not configured. Set it to the public RoqLock backend URL.");
  }
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Could not reach the RoqLock API at ${API_URL}. Check the API URL and CORS settings.`);
  }

  const text = await response.text();
  let result = null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new Error(`The API returned an unexpected response (${response.status}).`);
      }
      throw new Error("The API returned an invalid response.");
    }
  }

  if (!response.ok) {
    const issue = result?.details?.[0];
    const field = Array.isArray(issue?.path) ? issue.path.join(".") : "";
    const detail = issue?.message
      ? `${field ? `${field}: ` : ""}${issue.message}`
      : "";
    throw new Error(detail || result?.error || `Request failed (${response.status}).`);
  }
  return result;
}

export function publicDealUrl(url) {
  const token = new URL(url, window.location.origin).pathname.match(/\/deal\/([a-f0-9]{64})\/?$/i)?.[1];
  if (!token) throw new Error("The API returned a share link with an invalid format.");
  const baseUrl = `${PUBLIC_APP_URL}/deal/${token}`;
  if (!DEMO_MODE) return baseUrl;
  const deal = readDemoData().deals.find((item) => item.publicToken === token);
  if (!deal) throw new Error("The demo deal could not be found in this browser.");
  return `${baseUrl}?demo=${encodeDemoDeal(deal)}`;
}

export { API_URL };
