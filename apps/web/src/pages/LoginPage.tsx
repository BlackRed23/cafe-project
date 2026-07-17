import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useGoogleLogin, type TokenResponse } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Input } from "../components/common/Input";
import { Button } from "../components/common/Button";
import { getErrorMessage } from "../api/client";
import { Coffee } from "lucide-react";

export const LoginPage: React.FC = () => {
  const { login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = "Email không được để trống";
    }
    if (!password.trim()) {
      newErrors.password = "Mật khẩu không được để trống";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await login({ email, password });
      toast.success("Đăng nhập thành công.");

      const returnUrl = location.state?.returnUrl;
      if (returnUrl) {
        navigate(returnUrl);
      } else {
        const userStr = localStorage.getItem("user");
        const user = userStr ? JSON.parse(userStr) : null;
        if (user?.role === "ADMIN") {
          navigate("/admin/dashboard");
        } else {
          navigate("/");
        }
      }
    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      setApiError(errorMessage);
      toast.error("Đăng nhập thất bại", errorMessage || "Vui lòng kiểm tra email hoặc mật khẩu.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async ({ access_token }: TokenResponse) => {
      setApiError(null);
      setIsGoogleLoading(true);
      try {
        await loginWithGoogle(access_token);
        toast.success("Đăng nhập Google thành công.");
      } catch (err: any) {
        const errorMessage = getErrorMessage(err);
        setApiError(errorMessage);
        toast.error("Đăng nhập Google thất bại", errorMessage || "Vui lòng thử lại.");
      } finally {
        setIsGoogleLoading(false);
      }
    },
    onError: () => {
      toast.error("Đăng nhập Google thất bại", "Không thể lấy quyền truy cập từ Google.");
    },
    scope: "openid email profile",
  });

  return (
    <div className="max-w-md w-full mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 shadow-xl">
      {/* Title */}
      <div className="flex flex-col items-center mb-8">
        <div className="p-3 bg-amber-800 text-white rounded-2xl mb-3 shadow-md">
          <Coffee size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Đăng nhập tài khoản</h2>
        <p className="text-sm text-slate-400 mt-1">Chào mừng bạn quay lại với Cafe INV</p>
      </div>

      {apiError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-lg">
          {apiError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email"
          type="email"
          placeholder="name@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />

        <Input
          label="Mật khẩu"
          type="password"
          placeholder="••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        <Button type="submit" className="w-full py-3" isLoading={isLoading}>
          Đăng nhập
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Hoặc</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full py-3"
        isLoading={isGoogleLoading}
        onClick={() => handleGoogleLogin()}
      >
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700">
          G
        </span>
        Đăng nhập với Google
      </Button>

      <div className="mt-4 text-center">
        <Link to="/forgot-password" className="text-sm font-semibold text-amber-800 hover:text-amber-950 hover:underline">
          Quên mật khẩu?
        </Link>
      </div>

      {/* Navigation to Register */}
      <p className="text-center text-sm text-slate-500 mt-6">
        Chưa có tài khoản?{" "}
        <Link to="/register" className="font-semibold text-amber-800 hover:text-amber-950 hover:underline">
          Đăng ký ngay
        </Link>
      </p>


    </div>
  );
};
