import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useGoogleLogin, type TokenResponse } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Input } from "../components/common/Input";
import { Button } from "../components/common/Button";
import { getErrorMessage } from "../api/client";
import { AuthEditorial } from "../features/auth/AuthEditorial";

export const RegisterPage: React.FC = () => {
  const { register, loginWithGoogle } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string; password?: string; confirmPassword?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = "Họ và tên không được để trống";
    }

    if (!email.trim()) {
      newErrors.email = "Email không được để trống";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email không hợp lệ";
    }

    if (!phone.trim()) {
      newErrors.phone = "Số điện thoại không được để trống";
    } else if (phone.length < 10) {
      newErrors.phone = "Số điện thoại không hợp lệ";
    }

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      newErrors.password = "Mật khẩu không được để trống";
    } else if (trimmedPassword.length < 8) {
      newErrors.password = "Mật khẩu phải có ít nhất 8 ký tự";
    } else if (trimmedPassword.length > 64) {
      newErrors.password = "Mật khẩu tối đa 64 ký tự";
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/.test(trimmedPassword)) {
      newErrors.password = "Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt";
    }

    if (trimmedPassword !== confirmPassword.trim()) {
      newErrors.confirmPassword = "Mật khẩu nhập lại không khớp";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await register({ name: name.trim(), email: email.trim(), password: trimmedPassword, phone: phone.trim() });
      toast.success("Đăng ký thành công.");
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      setApiError(errorMessage);
      toast.error("Đăng ký thất bại", errorMessage || "Vui lòng kiểm tra lại thông tin.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = useGoogleLogin({
    onSuccess: async ({ access_token }: TokenResponse) => {
      setApiError(null);
      setIsGoogleLoading(true);
      try {
        await loginWithGoogle(access_token);
        toast.success("Đăng ký Google thành công.");
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err);
        setApiError(errorMessage);
        toast.error("Đăng ký Google thất bại", errorMessage || "Vui lòng thử lại.");
      } finally {
        setIsGoogleLoading(false);
      }
    },
    onError: () => {
      toast.error("Đăng ký Google thất bại", "Không thể lấy quyền truy cập từ Google.");
    },
    scope: "openid email profile",
  });

  return (
    <AuthEditorial mode="register">
      {apiError && (
        <div className="auth-error" role="alert">
          {apiError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="auth-form" aria-busy={isLoading}>
        <Input
          label="Họ và tên"
          type="text"
          placeholder="Nguyen Van A"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />

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
          label="Số điện thoại"
          type="tel"
          placeholder="0987654321"
          name="phone"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
        />

        <Input
          label="Mật khẩu"
          type="password"
          placeholder="••••••"
          aria-describedby="auth-password-help"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <p id="auth-password-help" className="auth-help">8–64 ký tự; gồm chữ hoa, chữ thường, số và ký tự @$!%*?&amp;#.</p>

        <Input
          label="Nhập lại mật khẩu"
          type="password"
          placeholder="••••••"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
        />

        <Button type="submit" className="auth-submit" isLoading={isLoading}>
          {isLoading ? "Đang đăng ký…" : "Đăng ký"}
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
        onClick={() => handleGoogleRegister()}
      >
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700">
          G
        </span>
        {isGoogleLoading ? "Đang kết nối…" : "Đăng ký với Google"}
      </Button>

      {/* Navigation to Login */}
      <p className="auth-switch">
        Đã có tài khoản?{" "}
        <Link to="/login" className="auth-link">
          Đăng nhập ngay
        </Link>
      </p>
    </AuthEditorial>
  );
};
