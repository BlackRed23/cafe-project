import React, { useEffect, useMemo, useState } from "react";
import { systemSettingsApi, type SystemSetting } from "../../api/systemSettings.api";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { Bot, Save, Settings, Store } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";

type SettingField = {
  key: string;
  label: string;
  helper?: string;
  multiline?: boolean;
  type?: "text" | "select" | "number" | "boolean" | "time";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

type SettingSection = {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  fields: SettingField[];
};

const SECTIONS: SettingSection[] = [
  {
    title: "Cài đặt AI Agent",
    description: "Điều chỉnh trạng thái hoạt động và nội dung nền cho AI Agent.",
    icon: Bot,
    fields: [
      { key: "ai.enabled", label: "Bật AI Agent", type: "boolean" },
      { key: "ai.slogan", label: "Mô tả ngắn AI Agent", placeholder: "Ví dụ: Trợ lý AI quản lý tồn kho thông minh", helper: "Mô tả ngắn hiển thị ở giao diện AI Agent." },
      { key: "ai.scanCron", label: "Thời gian quét tồn kho tự động hằng ngày", helper: "Chọn thời điểm hệ thống tự quét tồn kho mỗi ngày. Sau khi đổi cần restart Agent worker để áp dụng lịch mới.", type: "time" },
      { key: "ai.promptPrefix", label: "Prompt nền cho Gemini", placeholder: "Ví dụ: Hãy giải thích ngắn gọn, bám sát dữ liệu tồn kho và không tự suy đoán ngoài dữ liệu hệ thống.", multiline: true },
    ],
  },
  {
    title: "Cài đặt tồn kho",
    description: "Thiết lập các thông số mặc định dùng cho quản lý và cảnh báo tồn kho.",
    icon: Settings,
    fields: [
      {
        key: "inventory.defaultMinThreshold",
        label: "Ngưỡng tồn kho mặc định",
        helper: "Mức tồn kho tối thiểu mặc định dùng khi tạo tồn kho mới. Sản phẩm đã có ngưỡng riêng sẽ không bị ghi đè.",
        type: "number",
      },
    ],
  },
  {
    title: "Thông tin cửa hàng",
    description: "Thông tin liên hệ hiển thị và sử dụng trong vận hành cửa hàng.",
    icon: Store,
    fields: [
      { key: "store.name", label: "Tên cửa hàng" },
      { key: "store.email", label: "Email cửa hàng" },
      { key: "store.phone", label: "Số điện thoại cửa hàng" },
    ],
  },
];

const ALL_KEYS = SECTIONS.flatMap((section) => section.fields.map((field) => field.key));

const cronToTime = (cronStr: string): string => {
  const parts = cronStr.trim().split(/\s+/);
  if (parts.length === 5 && parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
    const minute = parts[0].padStart(2, '0');
    const hour = parts[1].padStart(2, '0');
    if (!isNaN(Number(minute)) && !isNaN(Number(hour))) {
      return `${hour}:${minute}`;
    }
  }
  return "00:05";
};

const timeToCron = (timeStr: string): string => {
  const [hour, minute] = timeStr.split(":");
  return `${Number(minute)} ${Number(hour)} * * *`;
};

export const AdminSystemSettingsPage: React.FC = () => {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const changedKeys = useMemo(
    () => ALL_KEYS.filter((key) => values[key] !== initialValues[key]),
    [values, initialValues]
  );


  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await systemSettingsApi.getSettings();
        const nextValues = buildValues(settings);
        setValues(nextValues);
        setInitialValues(nextValues);
      } catch (error) {
        toast.error("Lỗi", "Không thể tải cài đặt hệ thống.");
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [toast]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const validateSetting = (key: string, value: string): string | null => {
    if (key === "store.email" && value.trim()) {
      const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!EMAIL_REGEX.test(value.trim())) {
        return "Email cửa hàng không hợp lệ.";
      }
    }
    if (key === "store.phone" && value.trim()) {
      const PHONE_REGEX = /^[0-9+\-\s()]+$/;
      if (!PHONE_REGEX.test(value.trim())) {
        return "Số điện thoại cửa hàng không hợp lệ.";
      }
    }
    if (key === "ai.scanCron") {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(value.trim())) {
        return "Thời gian quét không hợp lệ.";
      }
    }
    if (key.includes("Threshold") || key.includes("Days")) {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        return "Giá trị phải là số dương.";
      }
    }
    return null;
  };

  const getSuccessMessage = (key: string, value: string, label: string) => {
    switch (key) {
      case "store.name":
        return "Đã cập nhật tên cửa hàng. Giao diện admin và email sẽ sử dụng tên mới.";
      case "store.email":
      case "store.phone":
        return "Đã cập nhật thông tin liên hệ cửa hàng.";
      case "ai.enabled":
        return value === "true" ? "AI Agent đã được bật." : "AI Agent đã được tắt. Hệ thống vẫn ghi nhận tồn kho nhưng không tự phân tích bằng AI.";
      case "ai.scanCron":
        return "Đã lưu lịch quét tồn kho tự động. Cần restart Agent worker để áp dụng lịch mới.";
      case "ai.promptPrefix":
        return "Đã lưu prompt nền AI. Thiết lập sẽ áp dụng cho lần tạo đề xuất Gemini tiếp theo.";
      case "inventory.defaultMinThreshold":
        return "Đã lưu ngưỡng tồn kho mặc định. Thiết lập áp dụng cho tồn kho mới.";
      default:
        return `Đã lưu cài đặt: ${label}`;
    }
  };

  const handleSave = async (key: string) => {
    const err = validateSetting(key, values[key] ?? "");
    const fieldLabel = SECTIONS.flatMap(s => s.fields).find(f => f.key === key)?.label || key;
    if (err) {
      toast.error(`Không thể lưu cài đặt: ${fieldLabel}`, err);
      return;
    }

    try {
      setSavingKey(key);
      const valueToSave = key === "ai.scanCron" ? timeToCron(values[key] ?? "00:05") : (values[key] ?? "");
      const updated = await systemSettingsApi.updateSetting(key, valueToSave);
      const updatedLocalValue = key === "ai.scanCron" ? cronToTime(updated.value) : updated.value;
      setValues((prev) => ({ ...prev, [key]: updatedLocalValue }));
      setInitialValues((prev) => ({ ...prev, [key]: updatedLocalValue }));
      toast.success(getSuccessMessage(key, updated.value, fieldLabel));

      window.dispatchEvent(
        new CustomEvent("system-settings-updated", {
          detail: {
            key: key,
            value: updated.value,
          },
        })
      );
    } catch (error: any) {
      toast.error(`Không thể lưu cài đặt: ${fieldLabel}`, error.response?.data?.message || "Lỗi hệ thống.");
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveAll = async () => {
    if (changedKeys.length === 0) {
      toast.info("Không có thay đổi để lưu.");
      return;
    }

    for (const key of changedKeys) {
      const err = validateSetting(key, values[key] ?? "");
      if (err) {
        toast.error("Một số cài đặt chưa được lưu. Vui lòng kiểm tra lại.", err);
        return;
      }
    }

    try {
      setSavingKey("ALL");
      const updatedSettings = await Promise.all(
        changedKeys.map((key) => {
          const valueToSave = key === "ai.scanCron" ? timeToCron(values[key] ?? "00:05") : (values[key] ?? "");
          return systemSettingsApi.updateSetting(key, valueToSave);
        })
      );
      const updatedValues = updatedSettings.reduce<Record<string, string>>((acc, setting) => {
        acc[setting.key] = setting.key === "ai.scanCron" ? cronToTime(setting.value) : setting.value;
        return acc;
      }, {});
      setValues((prev) => ({ ...prev, ...updatedValues }));
      setInitialValues((prev) => ({ ...prev, ...updatedValues }));
      toast.success("Đã lưu tất cả cài đặt hệ thống.");

      updatedSettings.forEach((setting) => {
        window.dispatchEvent(
          new CustomEvent("system-settings-updated", {
            detail: {
              key: setting.key,
              value: setting.value,
            },
          })
        );
      });
    } catch (error: any) {
      toast.error("Một số cài đặt chưa được lưu. Vui lòng kiểm tra lại.", error.response?.data?.message || "Lỗi hệ thống.");
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải cài đặt hệ thống..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-amber-900/10 bg-gradient-to-br from-white to-amber-50/60 p-5 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800/70">
            Quản trị hệ thống
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Cài đặt hệ thống</h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý các giá trị cấu hình đang được backend sử dụng.
          </p>
        </div>
        <Button
          onClick={handleSaveAll}
          isLoading={savingKey === "ALL"}
          disabled={changedKeys.length === 0 || !!savingKey}
          className="w-full lg:w-auto gap-2"
        >
          <Save size={16} />
          {savingKey === "ALL" ? "Đang lưu..." : "Lưu tất cả thay đổi"}
        </Button>
      </div>

      {SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <section key={section.title} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="rounded-xl bg-amber-50 p-2.5 text-amber-800">
                <Icon size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{section.title}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{section.description}</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {section.fields.map((field) => {
                const isChanged = values[field.key] !== initialValues[field.key];
                const isSaving = savingKey === field.key;
                return (
                  <div key={field.key} className="grid gap-4 px-5 py-4 lg:grid-cols-[260px_1fr_auto] lg:items-start">
                    <div>
                      <label htmlFor={field.key} className="text-sm font-bold text-slate-800">
                        {field.label}
                      </label>
                      <p className="mt-1 font-mono text-[12px] text-slate-400">{field.key}</p>
                      {field.helper && <p className="mt-1 text-xs text-slate-500">{field.helper}</p>}
                    </div>

                    {field.multiline ? (
                      <textarea
                        id={field.key}
                        value={values[field.key] ?? ""}
                        onChange={(event) => handleChange(field.key, event.target.value)}
                        maxLength={5000}
                        rows={5}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-700/10 disabled:bg-slate-50"
                        placeholder={field.placeholder || "Nhập giá trị cài đặt..."}
                        disabled={!!savingKey || (field.key === "inventory.reorderPlanningCustomDays" && values["inventory.reorderPlanningPeriod"] !== "CUSTOM")}
                      />
                    ) : field.type === "boolean" ? (
                      <div className="flex items-center gap-3 py-1">
                        <button
                          type="button"
                          disabled={!!savingKey}
                          onClick={() => handleChange(field.key, values[field.key] === "true" ? "false" : "true")}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 ${values[field.key] === "true" ? "bg-amber-600" : "bg-slate-200"
                            } ${!!savingKey ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${values[field.key] === "true" ? "translate-x-6" : "translate-x-1"
                              }`}
                          />
                        </button>
                        <span className="text-sm font-medium text-slate-700">
                          {values[field.key] === "true" ? "Đang bật" : "Đang tắt"}
                        </span>
                      </div>
                    ) : field.type === "select" ? (
                      <select
                        id={field.key}
                        value={values[field.key] || field.options?.[0]?.value || ""}
                        onChange={(event) => handleChange(field.key, event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-700/10 disabled:bg-slate-50"
                        disabled={!!savingKey}
                      >
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={field.key}
                        type={field.type === "time" ? "time" : field.type === "number" ? "number" : "text"}
                        min={field.type === "number" ? 0 : undefined}
                        value={values[field.key] ?? ""}
                        onChange={(event) => handleChange(field.key, event.target.value)}
                        maxLength={5000}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-700/10 disabled:bg-slate-50"
                        placeholder={field.placeholder || "Nhập giá trị cài đặt..."}
                        disabled={!!savingKey}
                      />
                    )}

                    <Button
                      type="button"
                      variant={isChanged ? "primary" : "outline"}
                      size="sm"
                      isLoading={isSaving}
                      disabled={!isChanged || !!savingKey}
                      onClick={() => handleSave(field.key)}
                      className="w-full lg:w-auto"
                    >
                      {isSaving ? "Đang lưu..." : "Lưu"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

function buildValues(settings: SystemSetting[]): Record<string, string> {
  const values = ALL_KEYS.reduce<Record<string, string>>((acc, key) => {
    acc[key] = "";
    return acc;
  }, {});

  settings.forEach((setting) => {
    if (setting.key in values) {
      values[setting.key] = setting.key === "ai.scanCron" ? cronToTime(setting.value ?? "5 0 * * *") : (setting.value ?? "");
    }
  });

  return values;
}
