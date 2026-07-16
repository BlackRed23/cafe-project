import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Input } from "../components/common/Input";
import { Button } from "../components/common/Button";
import { getErrorMessage } from "../api/client";
import { Coffee } from "lucide-react";

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
    } else if (trimmedPassword.length < 8 || trimmedPassword.length > 64) {
      newErrors.password = "Mật khẩu phải từ 8 đến 64 ký tự";
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
    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      setApiError(errorMessage);
      toast.error("Đăng ký thất bại", errorMessage || "Vui lòng kiểm tra lại thông tin.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = useGoogleLogin({
    onSuccess: async ({ access_token }) => {
      setApiError(null);
      setIsGoogleLoading(true);
      try {
        await loginWithGoogle(access_token);
        toast.success("Đăng ký Google thành công.");
      } catch (err: any) {
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
    <div className="max-w-md w-full mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 shadow-xl">
      {/* Title */}
      <div className="flex flex-col items-center mb-8">
        <div className="p-3 bg-amber-800 text-white rounded-2xl mb-3 shadow-md">
          <Coffee size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Đăng ký tài khoản</h2>
        <p className="text-sm text-slate-400 mt-1">Trở thành thành viên và đặt hàng nhanh chóng</p>
      </div>

      {apiError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-lg">
          {apiError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Họ và tên"
          type="text"
          placeholder="Nguyen Van A"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />

        <Input
          label="Email"
          type="email"
          placeholder="name@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />

        <Input
          label="Số điện thoại"
          type="tel"
          placeholder="0987654321"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
        />

        <Input
          label="Mật khẩu"
          type="password"
          placeholder="••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        <Input
          label="Nhập lại mật khẩu"
          type="password"
          placeholder="••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
        />

        <Button type="submit" className="w-full py-3" isLoading={isLoading}>
          Đăng ký
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
        onClick={() => handleGoogleRegister()}
      >
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700">
          G
        </span>
        Đăng ký với Google
      </Button>

      {/* Navigation to Login */}
      <p className="text-center text-sm text-slate-500 mt-6">
        Đã có tài khoản?{" "}
        <Link to="/login" className="font-semibold text-amber-800 hover:text-amber-950 hover:underline">
          Đăng nhập ngay
        </Link>
      </p>
    </div>
  );
};
