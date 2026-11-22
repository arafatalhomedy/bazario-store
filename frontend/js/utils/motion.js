/** True when the visitor asked the OS to reduce motion. */
export const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True for mouse/trackpad devices (not touch screens). */
export const hasFinePointer = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;