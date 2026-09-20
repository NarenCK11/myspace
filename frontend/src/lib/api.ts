import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

import type { ApiErrorBody, TokenResponse } from "@/types/api";

/*
 * The access token is held in memory only. The long-lived refresh token lives
 * in an HttpOnly cookie that JavaScript cannot read, so nothing sensitive is
 * ever written to localStorage.
 */
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function onAuthExpired(handler: () => void) {
  onSessionLost = handler;
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/** Endpoints that must never trigger a refresh-and-retry cycle. */
const NO_RETRY = ["/auth/login", "/auth/refresh", "/auth/logout"];

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token.
 * Concurrent callers share a single in-flight request so a burst of 401s
 * results in exactly one rotation.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post<TokenResponse>(`${API_BASE_URL}/api/auth/refresh`, null, {
        withCredentials: true,
      })
      .then((response) => {
        setAccessToken(response.data.access_token);
        return response.data.access_token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const url = config?.url ?? "";

    const retryable =
      status === 401 && config && !config._retried && !NO_RETRY.some((path) => url.includes(path));

    if (retryable) {
      config._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        return api.request(config);
      }
      onSessionLost?.();
    }

    return Promise.reject(error);
  },
);

/** Pulls a human-readable message out of any failure shape. */
export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    if (body?.error?.fields?.length) {
      return body.error.fields.map((f) => f.message).join(" ");
    }
    if (body?.error?.message) return body.error.message;
    if (error.code === "ECONNABORTED") return "The request timed out.";
    if (!error.response) return "Cannot reach the server. Check your connection.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function errorCode(error: unknown): string | null {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error?.code ?? null;
  }
  return null;
}
