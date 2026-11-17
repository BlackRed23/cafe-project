import { useState } from "react";

type Preference = "system" | "light" | "dark";
const key = "coffee-inv-storefront-theme";

export function useStorefrontTheme() {
  const [preference, setPreference] = useState<Preference>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch { return "system"; }
  });
  const choose = (value: Preference) => {
    setPreference(value);
    try { localStorage.setItem(key, value); } catch { /* Session choice still works. */ }
  };
  return { preference, choose };
}
