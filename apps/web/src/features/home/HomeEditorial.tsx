import { ArrowDown, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function HomeHero() {
  return (
    <section className="home-hero home-container" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <p className="home-eyebrow">01 / Coffee INV — Một khởi đầu riêng</p>
        <h1 id="home-title">Cà phê,<br />theo <em>nhịp riêng.</em></h1>
        <p className="home-intro">
          Một tách để bắt đầu. Một chút để chậm lại. Tìm dòng cà phê
          đóng gói phù hợp với cách bạn thưởng thức mỗi ngày.
        </p>
        <div className="home-hero-actions">
          <Link to="/products" className="home-button">
            Khám phá cà phê <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <a href="#about" className="home-text-link">
            Một chút cảm hứng <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="home-hero-note"><span aria-hidden="true">01 /</span> Dành một khoảnh khắc cho hương vị bạn yêu.</p>
      </div>
      <figure className="home-hero-figure">
        <div className="home-hero-image">
          <img
            src="/images/hero-bg.jpg"
            alt="Hai tách cà phê latte trên bàn gỗ giữa những tán lá xanh"
            width="1600"
            height="2400"
            fetchPriority="high"
          />
        </div>
        <figcaption><span>Cà phê & những khoảng dừng</span><span aria-hidden="true">COFFEE INV</span></figcaption>
      </figure>
    </section>
  );
}

export function BrandMarquee() {
  // Deliberately static: readable at every speed, including reduced motion.
  return (
    <div className="home-marquee" aria-label="Cảm hứng cà phê">
      <ul className="home-container">
        <li>Một tách cà phê</li>
        <li>Một nhịp chậm lại</li>
        <li>Một ngày của riêng bạn</li>
      </ul>
    </div>
  );
}

export function BrandStory() {
  return (
    <section id="about" className="home-story" aria-labelledby="home-story-title">
      <div className="home-container home-story-layout">
        <figure className="home-story-figure">
          <img
            src="/images/about-video-bg.jpg"
            alt="Ba người cùng nâng tách cà phê latte và cà phê đá"
            width="800"
            height="533"
            loading="lazy"
            decoding="async"
          />
          <figcaption>Một tách cà phê. Thêm một câu chuyện.</figcaption>
        </figure>
        <div className="home-story-copy">
          <p className="home-eyebrow">02 / Nghệ thuật pha</p>
          <h2 id="home-story-title">Từ một tách quen,<br />thành <em>một nghi thức.</em></h2>
          <p>
            Đong cà phê, thêm nước, đợi hương thơm lan ra.
            Dành một chút thời gian để pha theo cách bạn quen, rồi nhấp ngụm đầu tiên.
          </p>
          <p>
            Với Coffee INV, hãy bắt đầu từ hương vị bạn thích.
            Chọn cà phê cho góc bếp, bàn làm việc, hay một lần ngồi lại cùng nhau.
          </p>
          <Link to="/products" className="home-text-link">
            Tìm hương vị của bạn <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

const gallery = [
  { src: "/images/gallery-1.jpg", alt: "Những tách latte xếp dọc bàn gỗ bên cây xanh", caption: "Bên một góc xanh", width: 600, height: 900 },
  { src: "/images/gallery-2.jpg", alt: "Tách cà phê đen với lớp bọt mỏng nhìn từ trên cao", caption: "Gần hơn với hương vị", width: 400, height: 600 },
  { src: "/images/gallery-3.jpg", alt: "Những tách cà phê và sữa quanh chiếc bàn gỗ tròn", caption: "Cùng nhau, chậm một chút", width: 400, height: 600 },
];

export function HomeGallery() {
  return (
    <section id="gallery" className="home-gallery home-container" aria-labelledby="home-gallery-title">
      <div className="home-section-heading">
        <div>
          <p className="home-eyebrow">04 / Trải nghiệm</p>
          <h2 id="home-gallery-title">Cảm hứng <em>quanh ta.</em></h2>
        </div>
        <p>Một góc nhỏ, một tách quen.<br />Đôi khi, vậy là đủ.</p>
      </div>
      <div className="home-gallery-grid">
        {gallery.map((photo) => (
          <figure key={photo.src}>
            <div className="home-gallery-image">
              <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" />
            </div>
            <figcaption>{photo.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
