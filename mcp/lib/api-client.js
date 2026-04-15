const API_URL = process.env.SITEY_API_URL || "https://sitey.one";

async function apiCall(method, path, body, apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw { status: res.status, message: data.message || "API error", code: data.code };
  }
  return data.data || data;
}

module.exports = {
  get: (path, apiKey) => apiCall("GET", path, null, apiKey),
  post: (path, body, apiKey) => apiCall("POST", path, body, apiKey),
  patch: (path, body, apiKey) => apiCall("PATCH", path, body, apiKey),
  del: (path, apiKey) => apiCall("DELETE", path, null, apiKey),
};
