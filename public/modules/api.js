import { navigateTo } from "./router.js";

export function getAuthToken() {
  return localStorage.getItem("token");
}

export async function apiFetch(url, options = {}) {
  const config = { ...options };
  config.headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (config.body && typeof config.body !== "string") {
    config.headers["Content-Type"] =
      config.headers["Content-Type"] || "application/json";
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      const message =
        data?.error ||
        data?.message ||
        `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return data ?? {};
  } catch (error) {
    console.error("API request failed:", error);
    throw new Error(error.message || "Network error, please try again.");
  }
}

export function logoutAndRedirect(target = "/") {
  localStorage.removeItem("token");
  navigateTo(target);
}
