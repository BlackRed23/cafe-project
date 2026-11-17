# Cafe frontend design system

## Product and scope
Cafe operations pairs ingredient/BOM management with packaged stock, orders and purchasing. Prioritize legibility, stock exceptions and explicit actions over dashboard decoration. First adoption: production `/admin/ingredients`; existing mock workspace remains independent. No routes, payloads, role gates or approval rules change. Shared primitives affect existing consumers incrementally.

## Foundation
Source of truth: `apps/web/src/design-system.css`, imported after Tailwind in `index.css`. Retain React 19, Vite 8, Tailwind 4 and lucide-react; no library migration or new dependencies.

| Purpose | Token/value |
| --- | --- |
| Paper | cafe-paper #f7f5f0 |
| Ink / secondary text | cafe-ink #292620 / cafe-muted #625c53 |
| Dividers | cafe-line #d5cfc4 |
| Primary / hover | cafe-brand #65432e / cafe-brand-hover #4c3020 |
| Success / warning | cafe-success #245b42 / cafe-warning #785009 |
| Danger / information | cafe-danger #a12635 / cafe-info #25516d |

Use semantic colors with visible text; stock calculations remain domain code. White panels on paper, thin dividers, no decorative gradients or glass. Reserve elevation for overlays. Controls radius 6px; panels 8px; pills only when shape communicates purpose. Dialog shadow: 0 16px 48px #29262033.

Spacing uses 4px unit: 4, 8, 12, 16, 20, 24, 32, 40px. Dense table cells use 14/16px vertical/horizontal padding. Main sections 20–24px apart. Preserve viewport area for records.

Keep existing Outfit/system sans stack for shared UI, 15px/1.6 body. Operational page heading uses local Georgia serif, 24–32px/1.2; subsection 18px/1.4 semibold; field labels 14px; helper text 13px; table heading 12px. No additional font requests. Customer editorial typography remains unchanged.

## Layout and navigation
Use existing sidebar, header, customer layout and route hierarchy. One page heading, short workflow description, filter/action toolbar, then records. Do not substitute decorative stat cards for actionable filters. Ingredient filters wrap at small widths; table scrolls locally. Breakpoints follow Tailwind: 640, 768, 1024, 1280, 1536px. Use one column below 640px, flexible toolbar above; avoid fixed page widths. Preserve table semantics rather than duplicate mobile cards. Existing admin shell needs separate mobile audit.

## Engineering rules
Reuse common primitives before local JSX. Preserve public props and defaults; additive props preferred. Use PascalCase components and semantic token names. Keep styles in design-system.css; layout utilities remain at call sites. Avoid `transition-all`, scaling actions, invented utility shades, arbitrary new colors, decorative icons, giant corner radii and unnecessary whitespace. Do not remove legacy utilities until consumers migrate. No new dark theme: existing dark utility fragments are not a verified theme. New primitives stay light until complete semantic palette, contrast and all workflow states are tested together.

Before next adoption: inspect existing workflow, identify affected props, run focused checks, review mobile and keyboard, then full project suite for shared changes. Never replace production data with fixtures.

## Reference review (2026-11-17)
No source code or assets copied; no reference installed.

| Source | Verified status/license | Applicability and decision |
| --- | --- | --- |
| [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | Public, non-archived, MIT; ongoing collection, 69 commits visible | Use documentation structure as inspiration; no borrowed brand palette/assets. |
| [shadcn/ui](https://github.com/shadcn-ui/ui) / [docs](https://ui.shadcn.com/docs) | Public, MIT, current CLI package visible | Adopt owned, composable primitives concept; retain existing components rather than install CLI or overwrite styling. |
| [Storybook](https://github.com/storybookjs/storybook) / [docs](https://storybook.js.org/docs) | Public, non-archived, MIT; active repository | Component state matrix and isolated verification apply. Existing Playwright/Vite suffice for first slice; defer Storybook dependency/configuration. |
| [Antigravity Animation](https://github.com/davidpelayo/antigravity-animation) | GPL-3.0; archived 2026-10-15; two commits visible | Canvas particle simulation is unrelated to stock work and adds continuous rendering. README performance claims not independently profiled. Do not copy, install or experiment without explicit license review/approval; no runtime benchmark needed for excluded dependency. |
| [unslop](https://github.com/hey-damir/unslop) | Requested URL returned HTTP 404 | Documentation, maintenance and license NOT VERIFIED. No adoption. Apply task's explicit anti-cliche requirements independently. |

Live web views do not establish long-term support commitments. Recheck source license/version before any future adoption.
