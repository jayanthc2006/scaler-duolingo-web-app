import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_KEY, readPreference, resolveScheme, setPreference } from "@/lib/theme/theme";

function stubSystem(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const scheme = () => document.documentElement.dataset.scheme;
const runInitScript = () => new Function(THEME_INIT_SCRIPT)();

describe("theme", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage()); // Node's own experimental localStorage shadows jsdom's in some versions
    delete document.documentElement.dataset.scheme;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("resolves explicit choices and follows the device for auto", () => {
    expect(resolveScheme("light", true)).toBe("light");
    expect(resolveScheme("dark", false)).toBe("dark");
    expect(resolveScheme("system", true)).toBe("dark");
    expect(resolveScheme("system", false)).toBe("light");
  });

  it("defaults to following the device, and ignores junk in storage", () => {
    expect(readPreference()).toBe("system");
    window.localStorage.setItem(THEME_KEY, "neon");
    expect(readPreference()).toBe("system");
  });

  it("persists a choice and applies it immediately", () => {
    stubSystem(false);
    setPreference("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(scheme()).toBe("dark");
    setPreference("light");
    expect(scheme()).toBe("light");
    expect(readPreference()).toBe("light");
  });

  describe("pre-paint script (runs before React, from <head>)", () => {
    it("applies a stored dark choice even when the device is light", () => {
      stubSystem(false);
      window.localStorage.setItem(THEME_KEY, "dark");
      runInitScript();
      expect(scheme()).toBe("dark");
    });

    it("applies a stored light choice even when the device is dark", () => {
      stubSystem(true);
      window.localStorage.setItem(THEME_KEY, "light");
      runInitScript();
      expect(scheme()).toBe("light");
    });

    it("follows the device when nothing is stored", () => {
      stubSystem(true);
      runInitScript();
      expect(scheme()).toBe("dark");
      stubSystem(false);
      runInitScript();
      expect(scheme()).toBe("light");
    });

    it("survives blocked storage", () => {
      stubSystem(true);
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("blocked");
        },
      });
      expect(() => runInitScript()).not.toThrow();
      expect(readPreference()).toBe("system");
    });
  });
});
