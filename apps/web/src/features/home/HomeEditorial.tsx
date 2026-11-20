import { ArrowDownRight, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const container = "mx-auto w-[calc(100%-2.25rem)] max-w-6xl md:w-[calc(100%-3rem)] xl:w-[calc(100%-4rem)]";
const eyebrow = "text-xs font-bold uppercase tracking-widest text-[var(--sf-green)]";
const button = "inline-flex min-h-12 items-center justify-center gap-5 bg-[var(--sf-green)] px-6 py-3 text-sm font-semibold text-[var(--sf-on-green)] transition-colors hover:bg-[var(--sf-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sf-green)] motion-reduce:transition-none";
const link = "inline-flex min-h-11 items-center gap-3 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

export function HomeHero() {
  return (
    <section className={`${container} grid min-w-0 items-center gap-7 py-10 sm:py-14 md:grid-cols-2 md:gap-10 lg:gap-16 lg:py-24`} aria-labelledby="home-title">
      <div className="min-w-0">
        <p className={eyebrow}>COFFEE INV <span aria-hidden="true">/</span> GÓC CÀ PHÊ</p>
        <h1 id="home-title" className="my-6 max-w-xl font-['Playfair_Display',Georgia,serif] text-[clamp(2.5rem,5vw,4.5rem)] leading-tight font-normal tracking-tight text-pretty">
          Một tách cà phê.<br /><em className="font-normal text-[var(--sf-green)]">Một khoảng riêng.</em>
        </h1>
        <p className="max-w-md text-base leading-8 text-[var(--sf-muted)]">
          Có ngày cần một ly đậm để bắt đầu. Có ngày chỉ muốn ngồi chậm một chút.
          Chọn hương vị hợp với nhịp sống của bạn.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link to="/products" className={button}>Xem thực đơn <ArrowRight size={18} aria-hidden="true" /></Link>
          <a href="#about" className={link}>Chuyện bên tách cà phê <ArrowDownRight size={16} aria-hidden="true" /></a>
        </div>
        <div className="mt-10 flex max-w-md justify-between gap-4 border-t border-[var(--sf-line)] pt-4 text-xs text-[var(--sf-muted)] lg:mt-20" aria-hidden="true">
          <span>01 / 03</span><span>Một chút thân quen, mỗi ngày.</span>
        </div>
      </div>
      <figure className="m-0 min-w-0 md:translate-y-5">
        <div className="aspect-[5/4] overflow-hidden bg-[var(--sf-soft)] md:aspect-[5/6]">
          <img src="/images/hero-bg.jpg" alt="Những tách cà phê trên bàn gỗ, cạnh khoảng xanh" width="1600" height="2400" fetchPriority="high" className="block h-full w-full object-cover" />
        </div>
        <figcaption className="mt-3 flex flex-wrap justify-between gap-2 text-xs uppercase tracking-wide text-[var(--sf-muted)]">
          <span>Thưởng thức theo cách của bạn</span><span>COFFEE INV</span>
        </figcaption>
      </figure>
    </section>
  );
}

export function BrandStory() {
  return (
    <section id="about" className="scroll-mt-24 bg-[var(--sf-story)] text-[#f7f2e9]" aria-labelledby="home-story-title">
      <div className={`${container} grid min-w-0 items-center gap-9 py-14 md:grid-cols-2 md:gap-12 lg:gap-20 lg:py-24`}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-[#e3ceb1]">01 — LỜI MỜI</p>
          <h2 id="home-story-title" className="my-6 font-['Playfair_Display',Georgia,serif] text-[clamp(2.1rem,4vw,3.6rem)] leading-tight font-normal tracking-tight">
            Cà phê không cần<br />một dịp <em className="font-normal text-[#e3ceb1]">đặc biệt.</em>
          </h2>
          <p className="mb-4 max-w-md text-base leading-8 text-[#e8e8df]">
            Một buổi sáng còn ngái ngủ, một chiều cần nghỉ tay, hay một cuộc trò chuyện
            chưa muốn kết thúc. Cà phê có thể hiện diện trong những lúc giản dị như thế.
          </p>
          <p className="mb-4 max-w-md text-base leading-8 text-[#e8e8df]">
            Ở Coffee INV, bạn có thể bắt đầu bằng việc chọn một hương vị mình thích,
            rồi thưởng thức theo thói quen riêng.
          </p>
          <Link to="/products" className={`${link} mt-3 text-[#f5ebd8]`}>Tìm món hợp với bạn <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <figure className="m-0 min-w-0">
          <img src="/images/about-video-bg.jpg" alt="Những người bạn cùng nâng tách cà phê bên bàn" width="800" height="533" loading="lazy" decoding="async" className="block aspect-[6/5] w-full object-cover" />
          <figcaption className="mt-3 text-xs text-[#dce2d8]">Đôi khi, cuộc trò chuyện bắt đầu từ một tách cà phê.</figcaption>
        </figure>
      </div>
    </section>
  );
}

export function HomeGallery() {
  return (
    <>
      <section id="gallery" className={`${container} scroll-mt-24 py-16 lg:py-24`} aria-labelledby="home-craft-title">
        <div className="mb-9 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className={eyebrow}>03 — KHOẢNH KHẮC THƯỜNG NGÀY</p>
            <h2 id="home-craft-title" className="mt-4 font-['Playfair_Display',Georgia,serif] text-[clamp(2rem,4vw,3.6rem)] leading-tight font-normal tracking-tight">
              Một chút thời gian<br /><em className="font-normal text-[var(--sf-green)]">cho hương vị.</em>
            </h2>
          </div>
          <p className="max-w-sm text-base leading-8 text-[var(--sf-muted)]">
            Pha một tách cà phê, cảm nhận mùi thơm, rồi ngồi xuống.
            Không cần vội vàng để có một khoảng dừng dễ chịu.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 items-start gap-4 md:grid-cols-[1.15fr_.75fr_.9fr] md:gap-7">
          <figure className="col-span-2 m-0 min-w-0 md:col-span-1">
            <img src="/images/gallery-1.jpg" alt="Cà phê bên góc bàn có cây xanh" width="600" height="900" loading="lazy" decoding="async" className="block aspect-[5/4] w-full bg-[var(--sf-soft)] object-cover md:aspect-[3/4]" />
            <figcaption className="mt-3 text-xs text-[var(--sf-muted)]">01 / Một góc quen</figcaption>
          </figure>
          <div className="min-w-0 md:pt-16">
            <figure className="m-0 min-w-0">
              <img src="/images/gallery-2.jpg" alt="Tách cà phê đen nhìn từ trên cao" width="400" height="600" loading="lazy" decoding="async" className="block aspect-[3/4] w-full bg-[var(--sf-soft)] object-cover" />
              <figcaption className="mt-3 text-xs text-[var(--sf-muted)]">02 / Đậm đà theo sở thích</figcaption>
            </figure>
            <p className="mt-5 max-w-xs border-t border-[var(--sf-line)] pt-4 text-sm leading-7 text-[var(--sf-muted)]">
              Đậm hay nhẹ, nóng hay đá — mỗi người có một cách uống cà phê của riêng mình.
            </p>
          </div>
          <figure className="m-0 min-w-0 md:pt-8">
            <img src="/images/gallery-3.jpg" alt="Những tách cà phê được đặt cạnh nhau trên bàn" width="400" height="600" loading="lazy" decoding="async" className="block aspect-[4/5] w-full bg-[var(--sf-soft)] object-cover" />
            <figcaption className="mt-3 text-xs text-[var(--sf-muted)]">03 / Cùng ngồi lại</figcaption>
          </figure>
        </div>
      </section>
      <section className="border-t border-[var(--sf-line)] bg-[var(--sf-soft)] py-12 lg:py-16" aria-labelledby="home-close-title">
        <div className={`${container} flex flex-wrap items-end justify-between gap-6`}>
          <div>
            <p className={eyebrow}>HẸN BẠN Ở THỰC ĐƠN</p>
            <h2 id="home-close-title" className="mt-4 text-3xl leading-snug font-semibold tracking-tight md:text-4xl">
              Hôm nay, bạn muốn<br />uống gì?
            </h2>
          </div>
          <Link to="/products" className={button}>Chọn một tách cà phê <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </section>
    </>
  );
}
