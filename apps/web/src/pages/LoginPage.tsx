import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useGoogleLogin, type TokenResponse } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Input } from "../components/common/Input";
import { Button } from "../components/common/Button";
import { getErrorMessage } from "../api/client";
import { AuthEditorial } from "../features/auth/AuthEditorial";

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
    } catch (err: unknown) {
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
      } catch (err: unknown) {
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
    <AuthEditorial mode="login">
      {apiError && (
        <div className="auth-error" role="alert">
          {apiError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="auth-form" aria-busy={isLoading}>
        <Input
          label="Email"
          type="email"
          placeholder="name@domain.com"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />

        <Input
          label="Mật khẩu"
          type="password"
          placeholder="••••••"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        <Button type="submit" className="auth-submit" isLoading={isLoading}>
          {isLoading ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>

      <div className="auth-divider">
        <div className="auth-divider-line" />
        <span className="auth-muted">Hoặc</span>
        <div className="auth-divider-line" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="auth-google"
        isLoading={isGoogleLoading}
        onClick={() => handleGoogleLogin()}
      >
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700">
          G
        </span>
        {isGoogleLoading ? "Đang kết nối…" : "Đăng nhập với Google"}
      </Button>

      <div className="auth-recovery">
        <Link to="/forgot-password" className="auth-link">
          Quên mật khẩu?
        </Link>
      </div>

      {/* Navigation to Register */}
      <p className="auth-switch">
        Chưa có tài khoản?{" "}
        <Link to="/register" className="auth-link">
          Đăng ký ngay
        </Link>
      </p>


    </AuthEditorial>
  );
};
