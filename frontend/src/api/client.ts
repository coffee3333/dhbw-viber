import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { showToast } from "../utils/toast";

declare module "axios" {
  export interface AxiosRequestConfig {
    skipGlobalToast?: boolean;
  }
}

// Base API client with credentials & interceptors
export const apiClient = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60000,
});

// Listener callbacks for 401 Unauthorized (managed by Auth store / ViewModel)
type UnauthorizedHandler = () => void;
const unauthorizedHandlers: UnauthorizedHandler[] = [];

export function onUnauthorized(handler: UnauthorizedHandler) {
  unauthorizedHandlers.push(handler);
  return () => {
    const idx = unauthorizedHandlers.indexOf(handler);
    if (idx > -1) unauthorizedHandlers.splice(idx, 1);
  };
}

// Request Interceptor: Attach bearer token from localStorage if present
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("meeting_auth_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function formatApiErrorMessage(error: AxiosError<any>): { title: string; detail: string } {
  if (!error.response) {
    if (error.code === "ECONNABORTED") {
      return {
        title: "Request Timeout",
        detail: "The server took too long to respond. Please try again.",
      };
    }
    return {
      title: "Network Error",
      detail: "Unable to connect to the backend server. Please verify Docker/backend is running.",
    };
  }

  const status = error.response.status;
  const data = error.response.data as any;

  // Handle FastAPI 422 Unprocessable Entity
  if (status === 422 && Array.isArray(data?.detail)) {
    const issues = data.detail.map((d: any) => {
      const field = Array.isArray(d.loc) ? d.loc.slice(1).join(".") : "field";
      return `${field}: ${d.msg}`;
    });
    return {
      title: "Validation Error",
      detail: issues.join("\n"),
    };
  }

  let detailMsg = "";
  if (typeof data?.detail === "string") {
    detailMsg = data.detail;
  } else if (typeof data?.detail === "object") {
    detailMsg = JSON.stringify(data.detail);
  } else if (typeof data?.message === "string") {
    detailMsg = data.message;
  } else {
    detailMsg = error.message || "An unexpected error occurred.";
  }

  let title = "API Error";
  if (status === 400) title = "Invalid Request";
  else if (status === 401) title = "Authentication Required";
  else if (status === 403) title = "Access Forbidden";
  else if (status === 404) title = "Resource Not Found";
  else if (status >= 500) title = "Server Error";

  return { title, detail: detailMsg };
}

// Response Interceptor: Intercept 401s, display error toast, and format error details
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    const url = error.config?.url || "";
    const isAuthProbe = url.includes("/auth/status");

    // Intercept 401 on protected requests
    if (error.response?.status === 401 && !url.includes("/auth/")) {
      unauthorizedHandlers.forEach((handler) => handler());
    }

    const { title, detail } = formatApiErrorMessage(error);

    // Show toast unless explicitly suppressed or on passive auth status probe
    const skipToast = (error.config as any)?.skipGlobalToast || isAuthProbe;
    if (!skipToast) {
      showToast.error(title, detail);
    }

    return Promise.reject(new Error(detail));
  }
);
