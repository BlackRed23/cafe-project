import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Key, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { authApi } from "../api/auth.api";
import { getErrorMessage } from "../api/client";

export const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!currentPassword.trim() || !trimmedNew || !trimmedConfirm) {
      setError("Vui lòng điền đầy đủ các trường.");
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setError("Mật khẩu mới không khớp.");
      return;
    }

    if (trimmedNew.length < 8 || trimmedNew.length > 64) {
      setError("Mật khẩu mới phải từ 8 đến 64 ký tự.");
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/.test(trimmedNew)) {
      setError("Mật khẩu mới phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt.");
      return;
    }

    setIsLoading(true);

    try {
      await authApi.changePassword({ currentPassword, newPassword: trimmedNew });
      setIsLoading(false);
      setSuccess(true);
      
      // Logout and redirect to login after 3 seconds
      setTimeout(() => {
        logout();
      }, 3000);
    } catch (err: any) {
      setIsLoading(false);
      setError(getErrorMessage(err) || "Đổi mật khẩu thất bại. Vui lòng thử lại.");
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-emerald-100 rounded-3xl shadow-xl shadow-emerald-900/5 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
          <CheckCircle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Đổi mật khẩu thành công!</h2>
        <p className="text-slate-500">Mật khẩu của bạn đã được cập nhật. Bạn sẽ được đăng xuất để đăng nhập lại bằng mật khẩu mới...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto my-12 px-4 sm:px-0">
      <div className="bg-white rounded-3xl border border-amber-900/10 p-6 sm:p-10 shadow-2xl shadow-amber-900/5">
        <div className="flex flex-col items-center gap-4 mb-8 text-center">
          <div className="w-14 h-14 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center">
            <Key size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-serif">Đổi mật khẩu</h1>
            <p className="text-sm text-slate-500 mt-1">Cập nhật mật khẩu để bảo vệ tài khoản của bạn</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 text-sm font-medium rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="relative">
            <Input
              label="Mật khẩu hiện tại"
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Nhập mật khẩu hiện tại"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 p-1"
            >
              {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <Input
              label="Mật khẩu mới"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 p-1"
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <Input
              label="Xác nhận mật khẩu mới"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 p-1"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 flex items-center justify-center gap-2 bg-amber-800 hover:bg-amber-900 border-none text-white shadow-lg shadow-amber-900/15 text-[15px] rounded-xl"
            >
              {isLoading ? "Đang xử lý..." : "Cập nhật mật khẩu"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
