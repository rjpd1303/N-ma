import axios from "axios";
import { cacheApiResponse, readApiCache, queueSubmission } from "./offline";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (process.env.NODE_ENV === "production" ? "/_/backend" : "");

export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("eq_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Cache successful GETs, fall back to IndexedDB on network failure
api.interceptors.response.use(
  (response) => {
    const { config, data } = response;
    if (config.method === "get" && response.status < 400) {
      const key = (config.url || "") + (config.params ? JSON.stringify(config.params) : "");
      cacheApiResponse(key, data).catch(() => {});
    }
    return response;
  },
  async (error) => {
    const config = error.config || {};
    const isNetwork = !error.response;
    if (isNetwork && config.method === "get") {
      const key = (config.url || "") + (config.params ? JSON.stringify(config.params) : "");
      const cached = await readApiCache(key);
      if (cached !== undefined) {
        return { data: cached, status: 200, headers: {}, config, _offline: true };
      }
    }
    // For write operations (POST submit), let caller handle queueing.
    return Promise.reject(error);
  }
);

// Submission helper: try network, queue locally if it fails
export async function submitWithQueue(url, payload, kind = "submission") {
  try {
    const { data } = await api.post(url, payload);
    return { data, queued: false };
  } catch (e) {
    if (!e.response) {
      // network failure → queue
      await queueSubmission({ url, payload, kind, token: localStorage.getItem("eq_token") });
      return { data: null, queued: true };
    }
    throw e;
  }
}

export function formatApiError(detail) {
  if (detail == null) return "Algo salió mal. Inténtalo de nuevo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
