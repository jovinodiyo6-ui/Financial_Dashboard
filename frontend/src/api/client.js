const DEFAULT_TIMEOUT_MS = 12000;
const TOKEN_KEY = "token";
const LEGACY_TOKEN_KEY = "financepro_token";
const HOSTED_API_FALLBACK = "https://financial-dashboard-8jl0.onrender.com";

const isPrivateNetworkHost = (hostname) => {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const ipv4Match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

const resolveApiBase = () => {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return isPrivateNetworkHost(window.location.hostname) ? "/api" : HOSTED_API_FALLBACK;
  }
  return "";
};

export const API_BASE = resolveApiBase();
export const AUTH_EXPIRED_EVENT = "financepro:unauthorized";

export const readToken = () => {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const storeToken = (token) => {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(LEGACY_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
};

export class ApiError extends Error {
  constructor(message, { status = 0, category = "unknown", payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.category = category;
    this.payload = payload;
  }
}

const parsePayload = async (response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const classifyError = ({ status, aborted, payload }) => {
  if (aborted) {
    return "timeout";
  }
  if (status === 0) {
    return "network";
  }
  if (status === 400 || status === 422) {
    return "validation";
  }
  if (status === 401 || status === 403) {
    return "auth";
  }
  return "server";
};

const extractMessage = ({ payload, status, category }) => {
  if (payload && typeof payload === "object" && typeof payload.error === "string") {
    return payload.error;
  }
  const textPayload = typeof payload === "string" ? payload.trim() : "";
  const looksLikeHtml = textPayload.startsWith("<!doctype") || textPayload.startsWith("<html");
  if (textPayload && !looksLikeHtml) {
    return textPayload;
  }
  if (category === "auth") {
    return "Your session expired or this deployment requires sign-in. Please sign in again.";
  }
  if (category === "timeout") {
    return "The request took too long. Please try again.";
  }
  if (category === "network") {
    return "We could not reach the server. Check your connection and try again.";
  }
  return `Request failed (${status || "unknown"})`;
};

export function createApiClient({ getToken, onUnauthorized } = {}) {
  return async function api(path, options = {}) {
    const {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      headers,
      body,
      credentials = "same-origin",
      ...rest
    } = options;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const requestHeaders = new Headers(headers || {});
    const token = getToken?.();

    if (token && !requestHeaders.has("Authorization")) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }
    if (body !== undefined && !(body instanceof FormData) && !requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...rest,
        body,
        headers: requestHeaders,
        signal: controller.signal,
        credentials,
      });
    } catch (error) {
      window.clearTimeout(timeoutId);
      const category = classifyError({ status: 0, aborted: error?.name === "AbortError" });
      throw new ApiError(extractMessage({ payload: null, status: 0, category }), {
        status: 0,
        category,
      });
    }

    window.clearTimeout(timeoutId);
    const payload = await parsePayload(response);

    if (response.status === 401) {
      onUnauthorized?.();
    }

    if (!response.ok) {
      const category = classifyError({ status: response.status, payload });
      throw new ApiError(extractMessage({ payload, status: response.status, category }), {
        status: response.status,
        category,
        payload,
      });
    }

    return payload;
  };
}

export const api = createApiClient({
  getToken: readToken,
  onUnauthorized: () => {
    storeToken(null);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  },
});
