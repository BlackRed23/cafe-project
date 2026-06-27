import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

export function unwrapApiData<T = any>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }

  return payload as T;
}

export function unwrapApiField<T = any>(payload: any, field: string): T {
  const data = unwrapApiData<any>(payload);

  if (data && typeof data === "object" && field in data) {
    return data[field] as T;
  }

  return data as T;
}

export function unwrapApiList<T = any>(payload: any, field: string): T[] {
  const value = unwrapApiField<T[] | T>(payload, field);
  return Array.isArray(value) ? value : [];
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      if (!window.location.pathname.endsWith("/login")) {
        window.location.href = "/login";
      }
    }

    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Đã có lỗi xảy ra. Vui lòng thử lại.";

    if (error && typeof error === "object") {
      (error as any).friendlyMessage = message;
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(error: any): string {
  if (!error) return "Đã có lỗi xảy ra.";
  return error.friendlyMessage || error.response?.data?.message || error.response?.data?.error || error.message || "Đã có lỗi xảy ra.";
}
