# Motion

Tokens: fast 120ms, standard 180ms; easing cubic-bezier(0.2,0,0,1). Controls transition background, border and text only. Focus appears immediately and remains visible. Hover is supplementary; no meaning depends on it.

Dialog enters with opacity and 6px vertical translation over 180ms. Close immediately; native modal dialog manages top layer, keyboard containment and Escape. No delayed unmount or animation that postpones a stock action. Navigation keeps existing immediate router behavior; no route-wide transitions. Loading spins only while pending, with status text. Success uses existing toast feedback; no confetti or repeated motion.

`prefers-reduced-motion: reduce` collapses CSS animation and transitions throughout current frontend, including legacy animate-spin. Text still conveys loading. Do not add JS animation loops, layout-property animation, permanent will-change, particle systems or blur effects to operational screens. CSS suffices; Motion for React not justified. Antigravity review: DESIGN.md; GPL code excluded.

Verify keyboard focus after opening/closing dialog and reduced motion in browser. Assess transform/opacity cost on actual device before expanding motion.
