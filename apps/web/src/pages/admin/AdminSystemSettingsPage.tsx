import React, { useEffect, useMemo, useState } from "react";
import { systemSettingsApi, type SystemSetting } from "../../api/systemSettings.api";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { AlertCircle, Bot, CheckCircle2, Save, Settings, Store } from "lucide-react";

type SettingField = {
  key: string;
  label: string;
  helper?: string;
  multiline?: boolean;
  type?: "text" | "select" | "number";
  options?: Array<{ value: string; label: string }>;
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
      { key: "ai.enabled", label: "Bật AI Agent", helper: "Nhập true hoặc false." },
      { key: "ai.slogan", label: "Slogan AI" },
      { key: "ai.promptPrefix", label: "Prompt nền cho AI", multiline: true },
      { key: "ai.scanCron", label: "Lịch quét tồn kho", helper: "Ví dụ: */30 * * * *" },
    ],
  },
  {
    title: "Cài đặt tồn kho",
    description: "Thiết lập ngưỡng mặc định dùng cho cảnh báo tồn kho.",
    icon: Settings,
    fields: [
      {
        key: "inventory.defaultMinThreshold",
        label: "Ngưỡng tồn kho mặc định",
        helper: "Giá trị dạng chuỗi số, ví dụ: 10.",
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
  {
    title: "Cau hinh de xuat nhap hang",
    description: "Chon chu ky lap ke hoach nhap hang cho AI Agent.",
    icon: Settings,
    fields: [
      {
        key: "inventory.reorderPlanningPeriod",
        label: "Chu ky de xuat nhap hang",
        helper: "He thong se dua vao toc do ban trung binh moi ngay de de xuat so luong du cho chu ky da chon.",
        type: "select",
        options: [
          { value: "WEEKLY", label: "Theo tuan" },
          { value: "MONTHLY", label: "Theo thang" },
          { value: "CUSTOM", label: "Tuy chinh" },
        ],
      },
      {
        key: "inventory.reorderPlanningCustomDays",
        label: "So ngay muon du tru",
        helper: "Chi dung khi chon Tuy chinh.",
        type: "number",
      },
    ],
  },
];

const ALL_KEYS = SECTIONS.flatMap((section) => section.fields.map((field) => field.key));

export const AdminSystemSettingsPage: React.FC = () => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const changedKeys = useMemo(
    () => ALL_KEYS.filter((key) => values[key] !== initialValues[key]),
    [values, initialValues]
  );

  const reorderPlanningPreview = useMemo(() => {
    const period = values["inventory.reorderPlanningPeriod"] || "WEEKLY";
    const customDays = Number.parseInt(values["inventory.reorderPlanningCustomDays"] || "14", 10);
    const days = period === "MONTHLY" ? 30 : period === "CUSTOM" && customDays > 0 ? customDays : 7;
    const label = period === "MONTHLY" ? "Theo thang" : period === "CUSTOM" ? "Tuy chinh" : "Theo tuan";
    return `Dang chon: ${label}. He thong se de xuat so luong du ban trong khoang ${days} ngay, cong them thoi gian nhap hang va ton kho du phong.`;
  }, [values]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setMessage(null);
        const settings = await systemSettingsApi.getSettings();
        const nextValues = buildValues(settings);
        setValues(nextValues);
        setInitialValues(nextValues);
      } catch (error) {
        setMessage({ type: "error", text: "Không thể tải cài đặt hệ thống." });
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    try {
      setSavingKey(key);
      setMessage(null);
      const updated = await systemSettingsApi.updateSetting(key, values[key] ?? "");
      setValues((prev) => ({ ...prev, [key]: updated.value }));
      setInitialValues((prev) => ({ ...prev, [key]: updated.value }));
      setMessage({ type: "success", text: "Đã lưu cài đặt thành công." });
    } catch (error) {
      setMessage({ type: "error", text: "Không thể lưu cài đặt. Vui lòng kiểm tra lại dữ liệu." });
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveAll = async () => {
    if (changedKeys.length === 0) {
      setMessage({ type: "success", text: "Không có thay đổi cần lưu." });
      return;
    }

    try {
      setSavingKey("ALL");
      setMessage(null);
      const updatedSettings = await Promise.all(
        changedKeys.map((key) => systemSettingsApi.updateSetting(key, values[key] ?? ""))
      );
      const updatedValues = updatedSettings.reduce<Record<string, string>>((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {});
      setValues((prev) => ({ ...prev, ...updatedValues }));
      setInitialValues((prev) => ({ ...prev, ...updatedValues }));
      setMessage({ type: "success", text: "Đã lưu tất cả cài đặt thành công." });
    } catch (error) {
      setMessage({ type: "error", text: "Không thể lưu tất cả cài đặt. Vui lòng thử lại." });
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
          Lưu tất cả thay đổi
        </Button>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-4 text-sm font-medium ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        {reorderPlanningPreview}
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
                        placeholder="Nhập giá trị cài đặt..."
                        disabled={!!savingKey || (field.key === "inventory.reorderPlanningCustomDays" && values["inventory.reorderPlanningPeriod"] !== "CUSTOM")}
                      />
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
                        type={field.type === "number" ? "number" : "text"}
                        min={field.type === "number" ? 1 : undefined}
                        value={values[field.key] ?? ""}
                        onChange={(event) => handleChange(field.key, event.target.value)}
                        maxLength={5000}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-700/10 disabled:bg-slate-50"
                        placeholder="Nhập giá trị cài đặt..."
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
                      Lưu
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
      values[setting.key] = setting.value ?? "";
    }
  });

  return values;
}
