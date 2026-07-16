import React, { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { authApi } from "../api/auth.api";
import { getErrorMessage } from "../api/client";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { useToast } from "../contexts/ToastContext";

export const ForgotPasswordPage: React.FC = () => {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    setIsSent(false);

    if (!email.trim()) {
      setError("Email không được để trống");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Email không hợp lệ");
      return;
    }

    setError(undefined);
    setIsLoading(true);

    try {
      await authApi.forgotPassword({ email: email.trim() });
      setIsSent(true);
      toast.success("Đã gửi email đặt lại mật khẩu.");
    } catch (err: any) {
      const message = getErrorMessage(err);
      setApiError(message);
      toast.error("Không thể gửi email", message || "Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 shadow-xl">
      <div className="flex flex-col items-center mb-8">
        <div className="p-3 bg-amber-800 text-white rounded-2xl mb-3 shadow-md">
          <MailCheck size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Quên mật khẩu</h2>
        <p className="text-sm text-slate-400 mt-1 text-center">Nhập email để nhận liên kết đặt lại mật khẩu</p>
      </div>

      {apiError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-lg">
          {apiError}
        </div>
      )}

      {isSent && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium rounded-lg">
          Nếu email tồn tại, hệ thống đã gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email"
          type="email"
          placeholder="name@domain.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
        />

        <Button type="submit" className="w-full py-3" isLoading={isLoading}>
          Gửi email đặt lại mật khẩu
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
