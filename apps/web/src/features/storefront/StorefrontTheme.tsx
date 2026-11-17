import { useStorefrontTheme } from "./useStorefrontTheme";
import { Monitor, Moon, Sun } from "lucide-react";

export function ThemeControl({ preference, choose }: ReturnType<typeof useStorefrontTheme>) {
  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;
  return (
    <label className="storefront-theme">
      <Icon size={16} aria-hidden="true" />
      <select aria-label="Giao diện" value={preference} onChange={e => choose(e.target.value as Parameters<ReturnType<typeof useStorefrontTheme>["choose"]>[0])}>
        <option value="system">Hệ thống</option>
        <option value="light">Sáng</option>
        <option value="dark">Tối</option>
      </select>
    </label>
  );
}
