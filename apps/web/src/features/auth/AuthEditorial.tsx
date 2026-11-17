import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import "./auth.css";

export function AuthEditorial({ mode, children }: { mode: "login" | "register"; children: ReactNode }) {
  const registering = mode === "register";
  return (
    <section className={`coffee-auth coffee-auth--${mode}`} aria-labelledby="auth-title">
      <div className="auth-content">
        <Link to="/" className="auth-home"><ArrowLeft size={16} aria-hidden="true" /> Về trang chủ</Link>
        <div className="auth-form-panel">
          <header className="auth-heading">
            <p className="auth-eyebrow">Coffee INV / {registering ? "Một khởi đầu mới" : "Chào bạn trở lại"}</p>
            <h1 id="auth-title">{registering ? <>Bắt đầu một<br /><em>nhịp riêng.</em></> : <>Gặp lại bên<br /><em>tách cà phê.</em></>}</h1>
            <p>{registering ? "Tạo tài khoản Coffee INV của bạn." : "Đăng nhập để tiếp tục câu chuyện của bạn."}</p>
          </header>
          {children}
        </div>
      </div>
      <aside className="auth-editorial" aria-label="Một khoảng dừng cùng Coffee INV">
        <img src="/images/about-video-bg.jpg" alt="" width="900" height="1200" />
        <div className="auth-image-copy">
          <p className="auth-eyebrow">Coffee INV — Những khoảng dừng</p>
          <p className="auth-image-title">Chậm một chút.<br />Thưởng thức nhiều hơn.</p>
          <span>Cà phê, theo nhịp riêng.</span>
        </div>
      </aside>
    </section>
  );
}
