import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const THEME_COLOR_KEYS = [
  "background",
  "primary",
  "sidebar",
  "tabActive",
  "tableHeader",
  "tableStripe",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

const CSS_VAR: Record<ThemeColorKey, string> = {
  background: "--background",
  primary: "--primary",
  sidebar: "--sidebar",
  tabActive: "--tab-active",
  tableHeader: "--table-header",
  tableStripe: "--table-stripe",
};

export const THEME_COLOR_LABELS: Record<ThemeColorKey, string> = {
  background: "Page background",
  primary: "Primary / accent",
  sidebar: "Sidebar",
  tabActive: "Active tab",
  tableHeader: "Table header (columns)",
  tableStripe: "Table row stripe",
};

export const THEME_PRESETS: { name: string; colors: Record<ThemeColorKey, string> }[] = [
  {
    name: "Default blue",
    colors: {
      background: "#fdfdfe",
      primary: "#3d4f9e",
      sidebar: "#1e2436",
      tabActive: "#3d4f9e",
      tableHeader: "#eef0f7",
      tableStripe: "#f8f9fc",
    },
  },
  {
    name: "Emerald",
    colors: {
      background: "#fbfefd",
      primary: "#0f766e",
      sidebar: "#0b2b28",
      tabActive: "#0f766e",
      tableHeader: "#e7f4f1",
      tableStripe: "#f5faf9",
    },
  },
  {
    name: "Crimson",
    colors: {
      background: "#fffcfc",
      primary: "#b91c3c",
      sidebar: "#2a1418",
      tabActive: "#b91c3c",
      tableHeader: "#faeaed",
      tableStripe: "#fdf6f7",
    },
  },
  {
    name: "Amber",
    colors: {
      background: "#fffdfa",
      primary: "#b45309",
      sidebar: "#241a0f",
      tabActive: "#b45309",
      tableHeader: "#faf1e6",
      tableStripe: "#fdf9f2",
    },
  },
  {
    name: "Slate",
    colors: {
      background: "#fbfcfd",
      primary: "#334155",
      sidebar: "#0f172a",
      tabActive: "#334155",
      tableHeader: "#eef1f5",
      tableStripe: "#f8fafc",
    },
  },
];

const STORAGE_KEY = "app-theme-colors";

type ThemeColors = Partial<Record<ThemeColorKey, string>>;

interface ThemeColorsCtx {
  colors: ThemeColors;
  setColor: (key: ThemeColorKey, value: string) => void;
  applyPreset: (preset: Record<ThemeColorKey, string>) => void;
  reset: () => void;
}

const Ctx = createContext<ThemeColorsCtx>({
  colors: {},
  setColor: () => {},
  applyPreset: () => {},
  reset: () => {},
});

function applyToDocument(colors: ThemeColors) {
  const root = document.documentElement;
  for (const key of THEME_COLOR_KEYS) {
    const value = colors[key];
    if (value) root.style.setProperty(CSS_VAR[key], value);
    else root.style.removeProperty(CSS_VAR[key]);
  }
}

export function ThemeColorsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<ThemeColors>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ThemeColors;
        setColors(parsed);
        applyToDocument(parsed);
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  const persist = (next: ThemeColors) => {
    setColors(next);
    applyToDocument(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const setColor = (key: ThemeColorKey, value: string) => {
    persist({ ...colors, [key]: value });
  };

  const applyPreset = (preset: Record<ThemeColorKey, string>) => {
    persist({ ...preset });
  };

  const reset = () => {
    persist({});
  };

  return (
    <Ctx.Provider value={{ colors, setColor, applyPreset, reset }}>{children}</Ctx.Provider>
  );
}

export const useThemeColors = () => useContext(Ctx);
