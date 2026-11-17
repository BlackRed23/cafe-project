import React, { useState, useRef, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { ShoppingCart, LogOut, ShieldAlert, Menu, X, ArrowRight, Key, ChevronDown, User, Package } from "lucide-react";
import { ThemeControl } from "../features/storefront/StorefrontTheme";
import { useStorefrontTheme } from "../features/storefront/useStorefrontTheme";
import { useStorefrontMotion } from "../features/storefront/useStorefrontMotion";
import "../features/storefront/storefront.css";
import logoInventory from "../assets/logo-inventory1.png";

type NavItem = {
  label: string;
  path: string;
  isHash?: boolean;
  protected?: boolean;
};

export const CustomerLayout: React.FC = () => {
  const theme = useStorefrontTheme();
  const shellRef = useStorefrontMotion();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
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

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (userMenuOpen) { setUserMenuOpen(false); accountButtonRef.current?.focus(); }
      if (mobileMenuOpen) { setMobileMenuOpen(false); menuButtonRef.current?.focus(); }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileMenuOpen, userMenuOpen]);

  useEffect(() => {
    if (!("IntersectionObserver" in window) || !scrollSentinelRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      headerRef.current?.classList.toggle("is-scrolled", !entry.isIntersecting);
    });
    observer.observe(scrollSentinelRef.current);
    return () => observer.disconnect();
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
          document.getElementById(elementId)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }, 150);
      } else {
        document.getElementById(elementId)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
    <div ref={shellRef} data-storefront-theme={theme.preference} className="storefront min-h-screen flex flex-col">
      <a href="#storefront-main" className="storefront-skip">Đến nội dung chính</a>
      <div ref={scrollSentinelRef} className="storefront-sentinel" aria-hidden="true" />
      {/* Header */}
      <header ref={headerRef} className="storefront-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="storefront-header-row">
            {/* Logo */}
            <Link to="/" aria-label="Coffee INV — Trang chủ" className="storefront-logo flex items-center group">
              <div>
                <img src={logoInventory} alt="" width="48" height="48" />
              </div>
              <span>
                COFFEE <span>INV</span>
              </span>
            </Link>

            {/* Navigation links */}
            <nav aria-label="Điều hướng chính" className="storefront-desktop-nav">
              {navItems.map((item) => {
                if (item.protected && !isAuthenticated) return null;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={isActive(item) ? "page" : undefined}
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

            <ThemeControl {...theme} />

            {/* Right side actions */}
            <div className="storefront-desktop-actions">
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
                aria-label={`Giỏ hàng, ${totalItems} sản phẩm`}
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
                    ref={accountButtonRef}
                    aria-expanded={userMenuOpen}
                    aria-controls="storefront-account"
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
                    <div id="storefront-account" className="storefront-account absolute top-full right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl shadow-amber-900/10 border border-amber-900/10 overflow-hidden z-50">
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
            <div className="storefront-mobile-actions">
              {/* Cart Icon for mobile */}
              <Link
                to="/cart"
                aria-label={`Giỏ hàng, ${totalItems} sản phẩm`}
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
                ref={menuButtonRef}
                aria-label={mobileMenuOpen ? "Đóng điều hướng" : "Mở điều hướng"}
                aria-expanded={mobileMenuOpen}
                aria-controls="storefront-mobile-nav"
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
          <nav id="storefront-mobile-nav" aria-label="Điều hướng di động" className="storefront-mobile-nav bg-[#150d0a] border-t border-amber-955/30 px-4 pt-2 pb-4 space-y-2">
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
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main id="storefront-main" tabIndex={-1} className="flex-1 w-full mx-auto">
        <Outlet />
      </main>

      <footer id="contact" className="storefront-footer">
        <div className="storefront-footer-content">
          <div className="storefront-footer-story">
            <p className="storefront-eyebrow">05 / Kết nối</p>
            <h2>Hẹn nhau bên<br />một <em>tách cà phê.</em></h2>
            <p>Một buổi sáng cho riêng mình, hay một lần ngồi lại cùng nhau.
              Mang hương vị bạn thích vào những khoảnh khắc thường ngày.</p>
            <Link to="/products" className="storefront-footer-cta">Chọn cà phê cho ngày mai <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          <nav aria-label="Điều hướng cuối trang">
            <p className="storefront-eyebrow">Khám phá Coffee INV</p>
            {navItems.map(item => {
              if (item.protected && !isAuthenticated) return null;
              return <Link key={item.path} to={item.path} onClick={e => handleNavClick(item, e)}>{item.label}</Link>;
            })}
          </nav>
        </div>
        <div className="storefront-footer-bottom">
          <Link to="/" className="storefront-wordmark">COFFEE <span>INV</span></Link>
          <p>© {new Date().getFullYear()} Cafe INV. Đã đăng ký bản quyền.</p>
          <span>Cà phê & những khoảng dừng</span>
        </div>
      </footer>
    </div>
  );
};
