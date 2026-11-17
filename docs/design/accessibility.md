# Accessibility requirements

Target WCAG 2.2 AA. This document is a requirement, not a compliance certification.

- All controls keyboard operable with visible 2px focus outline and 3px offset. Do not remove focus styling without replacement.
- Visible field labels linked by stable ID. Error text connected with aria-describedby and aria-invalid; preserve caller descriptions. Icon-only controls require accessible name.
- Text contrast at least 4.5:1, large text 3:1, meaningful controls/focus 3:1. Check actual foreground/background pairs after utility overrides. Color never sole signal.
- Primary controls 44px high; compact table/buttons at least 40px. Touch targets never below 24px without WCAG spacing exception.
- Dialog has accessible title, native modal semantics, Escape, focus containment and focus return. Body scroll lock restores prior value. Test nested overlays before introducing them; current scope does not introduce nesting.
- Table uses caption, scoped headers, named keyboard-scrollable region and current-page state. Filter buttons expose pressed state and visible text.
- Loading status polite; error alert assertive. Avoid marking entire tables live. Empty state and failure use different messages.
- Respect reduced motion. Support zoom and wrapping; no global horizontal clipping. Test 375px mobile plus 768/1440px and keyboard zoom separately.

Known baseline gaps outside slice: partial dark classes, app-wide keyboard/contrast audit absent, legacy forms/action labels and mobile admin shell need review. Automated checks cover only executed harness assertions; full screen-reader, contrast tooling and live authorized workflow review remain explicit verification items.
