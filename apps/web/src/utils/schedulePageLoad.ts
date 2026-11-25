/** Start the request after the effect commits, unless it was already cleaned up. */
export const schedulePageLoad = (load: () => Promise<void> | void): (() => void) => {
  let active = true;
  queueMicrotask(() => {
    if (active) void load();
  });
  return () => { active = false; };
};
