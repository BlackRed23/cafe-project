import React, { useState, useRef, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { ShoppingCart, LogOut, Coffee, ShieldAlert, Heart, Menu, X, Send, Key, ChevronDown, User, Package } from "lucide-react";

type NavItem = {
  label: string;
  path: string;
  isHash?: boolean;
  protected?: boolean;
};

export const CustomerLayout: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { totalItems } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const navItems: NavItem[] = [
    { label: "Trang chủ", path: "/" },
    { label: "Sản phẩm", path: "/products" },
    { label: "Bộ sưu tập", path: "/#gallery", isHash: true },
    { label: "Liên hệ", path: "/#contact", isHash: true },
  ];

  const handleNavClick = (item: NavItem, e: React.MouseEvent) => {
    if (item.isHash) {
      e.preventDefault();
      setMobileMenuOpen(false);
      const elementId = item.path.substring(2);
      if (location.pathname !== "/") {
        navigate("/");
        setTimeout(() => {
          document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth" });
        }, 150);
      } else {
        document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      setMobileMenuOpen(false);
    }
  };

  const isActive = (item: NavItem) => {
    if (item.isHash) return false;
    if (item.path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(item.path);
  };

  const isAdmin = user?.role === "ADMIN";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (isAuthenticated && isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#faf6f0] text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#150d0a]/95 backdrop-blur-md text-amber-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center group">
              <div className="p-2.5 bg-white-300 text-white  group-hover:bg-white-600 transition-all ">
                <img className="w-20 h-20" src="./src/assets/logo-inventory1.png" alt="" />
              </div>
              <span className="font-bold text-xl tracking-tight text-white uppercase font-serif">
                COFFEE <span className="text-[#c49b76]">INV</span>
              </span>
            </Link>

            {/* Navigation links */}
            <nav className="hidden md:flex items-center gap-6">
              {navItems.map((item) => {
                if (item.protected && !isAuthenticated) return null;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={(e) => handleNavClick(item, e)}
                    className={`text-xs font-bold transition-all duration-200 relative py-1 uppercase tracking-wider ${isActive(item)
                      ? "text-[#c49b76] font-bold"
                      : "text-amber-250/80 hover:text-white"
                      }`}
                  >
                    {item.label}
                    {isActive(item) && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c49b76] rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right side actions */}
            <div className="hidden md:flex items-center gap-4">
              {/* Admin Panel button if role === "ADMIN" */}
              {isAuthenticated && isAdmin && (
                <Link
                  to="/admin/dashboard"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-amber-950 bg-[#c49b76] hover:bg-[#b08763] rounded-lg shadow-sm transition-colors uppercase tracking-wider"
                >
                  <ShieldAlert size={14} />
                  <span>Quản trị</span>
                </Link>
              )}

              {/* Cart Icon */}
              <Link
                to="/cart"
                className="relative p-2.5 text-amber-205 hover:text-white transition-colors rounded-xl hover:bg-white/5"
              >
                <ShoppingCart size={20} />
                {totalItems > 0 && (
                  <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-black leading-none text-[#150d0a] transform translate-x-1/2 -translate-y-1/2 bg-[#c49b76] rounded-full shadow-sm">
                    {totalItems}
                  </span>
                )}
              </Link>

              {/* User actions */}
              {isAuthenticated && user ? (
                <div className="relative flex items-center pl-3 border-l border-amber-955/30" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    <div className="flex flex-col text-right">
                      <span className="text-sm font-bold text-white leading-tight">{user.name}</span>
                      <span className="text-[10px] text-[#c49b76] font-semibold tracking-wider uppercase mt-0.5">
                        {user.role}
                      </span>
                    </div>
                    <ChevronDown size={16} className={`text-amber-200/70 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {userMenuOpen && (
                    <div className="absolute top-full right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl shadow-amber-900/10 border border-amber-900/10 overflow-hidden z-50">
                      <div className="p-3 border-b border-amber-900/5 bg-amber-50/50">
                        <p className="text-sm font-bold text-slate-800 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                      <div className="p-2 flex flex-col gap-1">
                        <Link
                          to="/profile"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-[14px] font-medium text-slate-600 hover:text-amber-800 hover:bg-amber-50 rounded-xl transition-colors"
                        >
                          <User size={16} /> Thông tin tài khoản
                        </Link>
                        <Link
                          to="/my-orders"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-[14px] font-medium text-slate-600 hover:text-amber-800 hover:bg-amber-50 rounded-xl transition-colors"
                        >
                          <Package size={16} /> Đơn hàng của tôi
                        </Link>
                        <Link
                          to="/change-password"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-[14px] font-medium text-slate-600 hover:text-amber-800 hover:bg-amber-50 rounded-xl transition-colors"
                        >
                          <Key size={16} /> Đổi mật khẩu
                        </Link>
                      </div>
                      <div className="p-2 border-t border-amber-900/5">
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleLogout();
                          }}
                          className="flex items-center gap-2.5 px-3 py-2 w-full text-[14px] font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        >
                          <LogOut size={16} /> Đăng xuất
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-3 border-l border-amber-955/30">
                  <button
                    onClick={() => navigate("/login")}
                    className="px-3.5 py-1.5 text-sm font-medium text-amber-205 hover:text-white"
                  >
                    Đăng nhập
                  </button>
                  <button
                    onClick={() => navigate("/register")}
                    className="px-4 py-2 text-sm font-bold text-[#150d0a] bg-[#c49b76] hover:bg-[#b08763] rounded-xl transition-all shadow-md shadow-amber-950/20 active:scale-95"
                  >
                    Đăng ký
                  </button>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-2">
              {/* Cart Icon for mobile */}
              <Link
                to="/cart"
                className="relative p-2.5 text-amber-205 hover:text-white transition-colors"
              >
                <ShoppingCart size={20} />
                {totalItems > 0 && (
                  <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-black leading-none text-[#150d0a] transform translate-x-1/2 -translate-y-1/2 bg-[#c49b76] rounded-full">
                    {totalItems}
                  </span>
                )}
              </Link>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-amber-205 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#150d0a] border-t border-amber-955/30 px-4 pt-2 pb-4 space-y-2">
            {navItems.map((item) => {
              if (item.protected && !isAuthenticated) return null;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={(e) => handleNavClick(item, e)}
                  className={`block px-3 py-2 rounded-lg text-base font-medium transition-colors ${isActive(item)
                    ? "bg-amber-900/40 text-[#c49b76] font-bold"
                    : "text-amber-250/80 hover:bg-white/5 hover:text-white"
                    }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {isAuthenticated && isAdmin && (
              <Link
                to="/admin/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-1.5 px-3 py-2 text-base font-bold text-[#c49b76]"
              >
                <ShieldAlert size={18} />
                <span>Quản trị viên</span>
              </Link>
            )}

            {isAuthenticated ? (
              <div className="pt-4 border-t border-amber-955/30">
                <div className="px-3 py-2 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">{user?.name}</span>
                    <span className="text-xs text-[#c49b76]">{user?.role}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        navigate("/profile");
                      }}
                      className="flex items-center gap-1 text-sm text-emerald-300 hover:text-white"
                    >
                      <User size={16} /> Tài khoản
                    </button>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        navigate("/change-password");
                      }}
                      className="flex items-center gap-1 text-sm text-amber-205 hover:text-white"
                    >
                      <Key size={16} /> Mật khẩu
                    </button>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleLogout();
                      }}
                      className="flex items-center gap-1 text-sm text-rose-400"
                    >
                      <LogOut size={16} /> Đăng xuất
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-amber-955/30 flex gap-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate("/login");
                  }}
                  className="flex-1 px-3 py-2 text-center text-sm font-medium text-amber-205 border border-amber-900 rounded-lg"
                >
                  Đăng nhập
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate("/register");
                  }}
                  className="flex-1 px-3 py-2 text-center text-sm font-bold text-[#150d0a] bg-[#c49b76] rounded-lg"
                >
                  Đăng ký
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full mx-auto">
        <Outlet />
      </main>

      {/* Footer - Enriched with detailed sections exactly like ThemeWagon Coffee */}
      <footer id="contact" className="bg-[#150d0a] text-amber-100 border-t border-amber-955/30 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Column 1: About and Socials */}
          <div className="flex flex-col gap-5">
            <Link to="/" className="flex items-center gap-2.5 w-fit group">
              <div className="p-1.5 bg-white-300 text-white group-hover:bg-white-600 transition-all rounded-lg">
                <img className="h-10 w-10 object-contain" src="./src/assets/logo-inventory1.png" alt="Logo" />
              </div>
              <span className="font-bold text-xl text-white uppercase tracking-wider font-serif">
                Cafe INV
              </span>
            </Link>
            <p className="text-[14.5px] text-amber-200/60 leading-relaxed font-light">
              Hệ thống quản lý bán hàng cà phê tích hợp tự động theo dõi tồn kho và đề xuất nhập hàng thông minh. Cam kết phân phối hạt cà phê mộc chất lượng và nâng cao hiệu suất chuỗi cung ứng.
            </p>
            <div className="flex gap-3 mt-2">
              <a href="#facebook" className="w-9 h-9 rounded-full border border-amber-955/30 hover:border-[#c49b76] flex items-center justify-center text-amber-250 hover:text-[#c49b76] transition-colors">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
              </a>
              <a href="#instagram" className="w-9 h-9 rounded-full border border-amber-955/30 hover:border-[#c49b76] flex items-center justify-center text-amber-250 hover:text-[#c49b76] transition-colors">
                <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
              </a>
            </div>
          </div>

          {/* Column 2: Navigation links */}
          <div>
            <h4 className="text-[14px] font-bold text-white uppercase tracking-widest mb-6">Menu Nhanh</h4>
            <ul className="space-y-3.5 text-[14.5px] text-amber-200/60 font-light">
              {navItems.map((item) => {
                if (item.protected && !isAuthenticated) return null;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={(e) => handleNavClick(item, e)}
                      className="hover:text-[#c49b76] transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Column 3: Opening Hours */}
          <div>
            <h4 className="text-[14px] font-bold text-white uppercase tracking-widest mb-6">Giờ Mở Cửa</h4>
            <ul className="space-y-3.5 text-[14.5px] text-amber-200/60 font-light">
              <li className="flex justify-between border-b border-amber-955/10 pb-2">
                <span>Thứ 2 - Thứ 6:</span>
                <span className="font-semibold text-white">6:00 AM - 10:00 PM</span>
              </li>
              <li className="flex justify-between border-b border-amber-955/10 pb-2">
                <span>Thứ 7 - Chủ Nhật:</span>
                <span className="font-semibold text-white">7:00 AM - 11:00 PM</span>
              </li>
              <li className="flex justify-between">
                <span>Ngày lễ:</span>
                <span className="font-semibold text-[#c49b76]">Mở cửa cả ngày</span>
              </li>
            </ul>
          </div>

          {/* Column 4: Newsletter */}
          <div className="flex flex-col gap-4">
            <h4 className="text-[14px] font-bold text-white uppercase tracking-widest mb-2">Đăng ký nhận tin</h4>
            <p className="text-[14.5px] text-amber-200/60 font-light">
              Nhận thông tin cập nhật về các sản phẩm cà phê hạt và chương trình ưu đãi mới nhất.
            </p>
            <form onSubmit={(e) => e.preventDefault()} className="flex border border-amber-955/30 rounded-xl overflow-hidden mt-1 bg-white/5 focus-within:border-[#c49b76] transition-colors">
              <input
                type="email"
                placeholder="Email của bạn..."
                className="flex-1 px-3 py-2.5 bg-transparent text-[14px] text-white placeholder-amber-200/35 outline-none border-none"
              />
              <button type="submit" className="px-4.5 bg-amber-700 hover:bg-amber-600 text-white transition-colors border-none flex items-center justify-center">
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 pt-8 border-t border-amber-955/10 text-[12px] text-amber-200/40 flex items-center justify-center">
          <p>© {new Date().getFullYear()} Cafe INV. Đã đăng ký bản quyền.</p>
        </div>
      </footer>
    </div>
  );
};
