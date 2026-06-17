import { apiClient, unwrapApiData } from "./client";

export interface SystemSetting {
  key: string;
  value: string;
  updatedAt?: string | null;
}

const normalizeSetting = (setting: any): SystemSetting => ({
  key: String(setting?.key ?? ""),
  value: String(setting?.value ?? ""),
  updatedAt: setting?.updatedAt ?? setting?.updated_at ?? null,
});

const unwrapSettings = (payload: any): SystemSetting[] => {
  const data = unwrapApiData<any>(payload);
  const settings = Array.isArray(data) ? data : data?.settings;
  return Array.isArray(settings) ? settings.map(normalizeSetting) : [];
};

export const systemSettingsApi = {
  getSettings: async (): Promise<SystemSetting[]> => {
    const response = await apiClient.get("/system-settings");
    return unwrapSettings(response.data);
  },

  getSetting: async (key: string): Promise<SystemSetting> => {
    const response = await apiClient.get(`/system-settings/${encodeURIComponent(key)}`);
    return normalizeSetting(unwrapApiData(response.data));
  },

  updateSetting: async (key: string, value: string): Promise<SystemSetting> => {
    const response = await apiClient.patch(`/system-settings/${encodeURIComponent(key)}`, { value });
    return normalizeSetting(unwrapApiData(response.data));
  },
};
