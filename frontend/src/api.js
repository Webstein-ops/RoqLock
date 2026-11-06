const localApiUrl = import.meta.env.DEV ? "http://127.0.0.1:3000" : "";
const API_URL = (import.meta.env.VITE_API_URL || localApiUrl).replace(/\/+$/, "");

export async function api(path, { token, method = "GET", body } = {}) {
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
    const requestError = new Error(detail || result?.error || `Request failed (${response.status}).`);
    requestError.status = response.status;
    throw requestError;
  }
  return result;
}

export function publicDealUrl(url) {
  const token = new URL(url, window.location.origin).pathname.match(/\/deal\/([a-f0-9]{64})\/?$/i)?.[1];
  if (!token) throw new Error("The API returned a share link with an invalid format.");
  return `${window.location.origin}/deal/${token}`;
}

export { API_URL };
