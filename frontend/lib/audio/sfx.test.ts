import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOUND_KEY, isSoundEnabled, setSoundEnabled } from "@/lib/audio/soundPreference";

// Node's experimental localStorage can shadow jsdom's, so tests bring their own.
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

function stubAudio(state: "running" | "suspended" = "running") {
  const oscillators: { start: ReturnType<typeof vi.fn> }[] = [];
  const resume = vi.fn().mockResolvedValue(undefined);
  class FakeContext {
    state = state;
    currentTime = 0;
    destination = {};
    resume = resume;
    createGain() {
      const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
      return { gain: param, connect: (next: unknown) => next };
    }
    createOscillator() {
      const osc = {
        type: "sine", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: (next: unknown) => next, start: vi.fn(), stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }
  }
  vi.stubGlobal("AudioContext", FakeContext);
  return { oscillators, resume };
}

describe("sound preference", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("is on by default, persists the choice and survives blocked storage", () => {
    expect(isSoundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(window.localStorage.getItem(SOUND_KEY)).toBe("off");
    expect(isSoundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(isSoundEnabled()).toBe(true);
    expect(() => setSoundEnabled(false)).not.toThrow();
  });
});

describe("playSfx", () => {
  // the module keeps one shared AudioContext, so every test gets a fresh copy of it
  let playSfx: (cue: "correct" | "wrong" | "complete") => void;
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", memoryStorage());
    ({ playSfx } = await import("@/lib/audio/sfx"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("plays each cue with the expected number of notes", () => {
    const { oscillators } = stubAudio();
    playSfx("correct");
    expect(oscillators.length).toBe(2);
    playSfx("wrong");
    expect(oscillators.length).toBe(3);
    playSfx("complete");
    expect(oscillators.length).toBe(7);
    expect(oscillators.every((o) => o.start.mock.calls.length === 1)).toBe(true);
  });

  it("is silent when Sound effects is off, and plays again when it is back on", () => {
    const { oscillators } = stubAudio();
    setSoundEnabled(false);
    playSfx("correct");
    playSfx("wrong");
    playSfx("complete");
    expect(oscillators.length).toBe(0);
    setSoundEnabled(true);
    playSfx("correct");
    expect(oscillators.length).toBe(2);
  });

  it("never throws when audio is unavailable, blocked, or failing", async () => {
    expect(() => playSfx("correct")).not.toThrow(); // jsdom has no AudioContext at all

    class BrokenContext {
      state = "suspended";
      currentTime = 0;
      resume = vi.fn().mockRejectedValue(new Error("autoplay blocked")); // would be an unhandled rejection if not caught
      createOscillator() {
        throw new Error("boom");
      }
    }
    vi.stubGlobal("AudioContext", BrokenContext);
    expect(() => playSfx("wrong")).not.toThrow();
    await Promise.resolve(); // let a stray rejection surface; vitest fails the run on an unhandled one
  });

  it("asks a suspended context to resume (autoplay policy) before playing", () => {
    const { resume } = stubAudio("suspended");
    playSfx("correct");
    expect(resume).toHaveBeenCalled();
  });
});
