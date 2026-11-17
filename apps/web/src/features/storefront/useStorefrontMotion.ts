import { useEffect, useRef } from "react";

// Animate only elements entering below the fold; reading never waits for JS.
export function useStorefrontMotion() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const reset = () => {
      observer?.disconnect();
      element.querySelectorAll(".storefront-reveal").forEach(node => node.classList.remove("storefront-reveal"));
      if (media.matches || !("IntersectionObserver" in window)) return;
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.remove("storefront-reveal");
            observer?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08 });
      element.querySelectorAll(".home-story-layout, .home-gallery-grid figure, .storefront-footer-content").forEach(node => {
        if (node.getBoundingClientRect().top > innerHeight) {
          node.classList.add("storefront-reveal");
          observer?.observe(node);
        }
      });
    };
    reset();
    media.addEventListener("change", reset);
    // Home can mount after client-side navigation without remounting the shell.
    const mutation = new MutationObserver(reset);
    mutation.observe(element, { childList: true, subtree: true });
    return () => {
      observer?.disconnect();
      mutation.disconnect();
      media.removeEventListener("change", reset);
    };
  }, []);
  return root;
}
