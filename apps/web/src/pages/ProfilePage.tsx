import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, Phone, CheckCircle, Save } from "lucide-react";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { useAuth } from "../contexts/AuthContext";

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setEmail(user.email || "");
      setPhone(user.phone || "");
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!name || !email) {
      setError("Họ tên và Email không được để trống.");
      return;
    }

    setIsLoading(true);
    
    // Simulate API update
    setTimeout(async () => {
      setIsLoading(false);
      setSuccess(true);
      
      // Update local storage manually for mock purpose
      if (user) {
        const updatedUser = { ...user, name, email, phone };
        localStorage.setItem("user", JSON.stringify(updatedUser));
        
      }
      
      // Auto redirect
      setTimeout(() => {
        window.location.href = "/"; // Reload to refresh auth context state easily
      }, 1500);
    }, 1000);
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-emerald-100 rounded-3xl shadow-xl shadow-emerald-900/5 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
          <CheckCircle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Cập nhật thành công!</h2>
        <p className="text-slate-500">Thông tin tài khoản đã được lưu. Đang tải lại...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto my-12 px-4 sm:px-0">
      <div className="bg-white rounded-3xl border border-amber-900/10 p-6 sm:p-10 shadow-2xl shadow-amber-900/5">
        <div className="flex flex-col items-center gap-4 mb-8 text-center">
          <div className="w-14 h-14 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center">
            <User size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-serif">Thông tin tài khoản</h1>
            <p className="text-sm text-slate-500 mt-1">Chỉnh sửa thông tin cá nhân của bạn</p>
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
              label="Họ và tên"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập họ và tên"
            />
            <User size={16} className="absolute right-3.5 top-9 text-slate-400" />
          </div>
          
          <div className="relative">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập địa chỉ email"
            />
            <Mail size={16} className="absolute right-3.5 top-9 text-slate-400" />
          </div>
          
          <div className="relative">
            <Input
              label="Số điện thoại"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Nhập số điện thoại"
            />
            <Phone size={16} className="absolute right-3.5 top-9 text-slate-400" />
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
              className="flex-1 py-3 border-amber-900/20 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 flex items-center justify-center gap-2 bg-amber-800 hover:bg-amber-900 border-none text-white shadow-lg shadow-amber-900/15 text-[15px] rounded-xl font-semibold"
            >
              {isLoading ? "Đang lưu..." : (
                <>
                  <Save size={18} /> Lưu thay đổi
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
