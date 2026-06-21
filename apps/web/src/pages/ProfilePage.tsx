import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usersApi } from "../api/users.api";
import { Input } from "../components/common/Input";
import { Button } from "../components/common/Button";
import { useToast } from "../contexts/ToastContext";
import { User, Mail, Phone, Shield, CheckCircle } from "lucide-react";

export const ProfilePage: React.FC = () => {
  const { user, loadMe } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning("Họ và tên không được để trống.");
      return;
    }

    setIsSaving(true);
    setSaved(false);
    try {
      await usersApi.updateProfile({ name: name.trim(), phone: phone.trim() });
      // Đồng bộ lại AuthContext từ DB
      await loadMe();
      setSaved(true);
      toast.success("Cập nhật thành công", "Thông tin của bạn đã được lưu.");
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error("Cập nhật thất bại", "Đã có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto my-12 px-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center text-white text-2xl font-black shadow-lg">
          {user?.name?.charAt(0).toUpperCase() || "U"}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{user?.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase tracking-wider">
              <Shield size={10} /> {user?.role === "ADMIN" ? "Admin" : "Khách hàng"}
            </span>
            <span className="text-sm text-slate-400">{user?.email}</span>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-[15px] font-semibold text-slate-700 flex items-center gap-2">
            <User size={16} className="text-amber-700" />
            Thông tin cá nhân
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Cập nhật tên và số điện thoại của bạn</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          {/* Email - read only */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-600 flex items-center gap-1.5">
              <Mail size={13} /> Địa chỉ Email
            </label>
            <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 font-medium">
              {user?.email}
              <span className="ml-auto text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Không thể thay đổi</span>
            </div>
          </div>

          <Input
            label="Họ và tên"
            type="text"
            placeholder="Nguyễn Văn A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-600 flex items-center gap-1.5">
              <Phone size={13} /> Số điện thoại
            </label>
            <input
              type="tel"
              placeholder="0987654321"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSaving}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-60 transition"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <Button
              type="submit"
              isLoading={isSaving}
              className="w-full py-3 flex items-center justify-center gap-2"
            >
              {saved ? (
                <>
                  <CheckCircle size={16} /> Đã lưu thành công
                </>
              ) : (
                "Lưu thay đổi"
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Info note */}
      <p className="text-center text-xs text-slate-400 mt-4">
        Để thay đổi mật khẩu, vui lòng vào trang{" "}
        <a href="/change-password" className="text-amber-700 font-semibold hover:underline">
          Đổi mật khẩu
        </a>
      </p>
    </div>
  );
};
