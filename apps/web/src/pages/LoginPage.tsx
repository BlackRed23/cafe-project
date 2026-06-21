import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Input } from "../components/common/Input";
import { Button } from "../components/common/Button";
import { getErrorMessage } from "../api/client";
import { Coffee } from "lucide-react";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      setApiError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 shadow-xl">
      {/* Title */}
      <div className="flex flex-col items-center mb-8">
        <div className="p-3 bg-amber-800 text-white rounded-2xl mb-3 shadow-md">
          <Coffee size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Đăng nhập tài khoản</h2>
        <p className="text-sm text-slate-400 mt-1">Chào mừng bạn quay lại với Cafe System</p>
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

      {/* Navigation to Register */}
      <p className="text-center text-sm text-slate-500 mt-6">
        Chưa có tài khoản?{" "}
        <Link to="/register" className="font-semibold text-amber-800 hover:text-amber-950 hover:underline">
          Đăng ký ngay
        </Link>
      </p>

      {/* Demo credentials banner */}
      <div className="mt-8 pt-6 border-t border-slate-100">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
          Tài khoản dùng thử (Demo)
        </h4>
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <span className="font-bold text-slate-700 block mb-0.5">Admin:</span>
            <span>admin@cafe.local</span>
            <span className="block text-[10px] text-slate-400 mt-0.5">Mật khẩu: 123456</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <span className="font-bold text-slate-700 block mb-0.5">Customer:</span>
            <span>customer@cafe.local</span>
            <span className="block text-[10px] text-slate-400 mt-0.5">Mật khẩu: 123456</span>
          </div>
        </div>
      </div>
    </div>
  );
};
