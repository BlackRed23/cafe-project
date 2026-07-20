import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { authApi } from "../api/auth.api";
import { getErrorMessage } from "../api/client";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { useToast } from "../contexts/ToastContext";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/;

const validatePassword = (password: string): string | undefined => {
  if (!password.trim()) return "Mật khẩu mới không được để trống";
  if (password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự";
  if (password.length > 64) return "Mật khẩu tối đa 64 ký tự";
  if (!PASSWORD_REGEX.test(password)) {
    return "Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt";
  }
  return undefined;
};

export const ResetPasswordPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string; token?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);

    const nextErrors: typeof errors = {};
    if (!token) nextErrors.token = "Liên kết đặt lại mật khẩu không hợp lệ";

    const passwordError = validatePassword(newPassword);
    if (passwordError) nextErrors.newPassword = passwordError;

    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = "Mật khẩu xác nhận không khớp";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await authApi.resetPassword({ token, newPassword });
      toast.success("Đặt lại mật khẩu thành công.");
      navigate("/login");
    } catch (err: any) {
      const message = getErrorMessage(err);
      setApiError(message);
      toast.error("Không thể đặt lại mật khẩu", message || "Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 shadow-xl">
      <div className="flex flex-col items-center mb-8">
        <div className="p-3 bg-amber-800 text-white rounded-2xl mb-3 shadow-md">
          <KeyRound size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Đặt lại mật khẩu</h2>
        <p className="text-sm text-slate-400 mt-1 text-center">Tạo mật khẩu mới cho tài khoản của bạn</p>
      </div>

      {(apiError || errors.token) && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-lg">
          {apiError || errors.token}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Mật khẩu mới"
          type="password"
          placeholder="••••••••"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={errors.newPassword}
        />

        <Input
          label="Xác nhận mật khẩu"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
        />

        <Button type="submit" className="w-full py-3" isLoading={isLoading}>
          Cập nhật mật khẩu
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        <Link to="/login" className="font-semibold text-amber-800 hover:text-amber-950 hover:underline">
          Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
};
