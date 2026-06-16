import axios from "axios";
import { MockDB } from "./mockDb";

// Initialize mock DB data in LocalStorage
MockDB.init();

// Toggle mock mode. When true, all API modules route locally.
export const USE_MOCK = false;

export const apiClient = axios.create({
  baseURL: '/api',
});

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
