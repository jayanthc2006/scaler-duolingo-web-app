import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = ((event?: unknown) => void) | null;

class FakeUtterance {
  lang = "";
  rate = 1;
  voice: { lang: string; name?: string } | null = null;
  onstart: Handler = null;
  onend: Handler = null;
  onerror: Handler = null;
  constructor(public text: string) {}
}

/** A small model of speechSynthesis: one utterance plays, extras QUEUE (the real browser behaviour we must avoid). */
class FakeSynth {
  voices: { lang: string; name: string }[] = [];
  speaking = false;
  pending = false;
  paused = false;
  queue: FakeUtterance[] = [];
  maxQueued = 0;
  spoken: FakeUtterance[] = [];
  cancelCalls = 0;
  resumeCalls = 0;
  failNextSpeak = false;
  autoStart = true; // false = the engine accepts the utterance but never starts it (stuck)
  private listeners = new Set<() => void>();
  getVoices() {
    return this.voices;
  }
  addEventListener(_: string, fn: () => void) {
    this.listeners.add(fn);
  }
  removeEventListener(_: string, fn: () => void) {
    this.listeners.delete(fn);
  }
  fireVoicesChanged() {
    [...this.listeners].forEach((fn) => fn());
  }
  resume() {
    this.resumeCalls++;
    this.paused = false;
  }
  speak(u: FakeUtterance) {
    if (this.failNextSpeak) {
      this.failNextSpeak = false;
      throw new Error("synthesis unavailable");
    }
    this.spoken.push(u);
    if (this.speaking) {
      this.queue.push(u);
      this.pending = true;
      this.maxQueued = Math.max(this.maxQueued, this.queue.length);
      return;
    }
    this.begin(u);
  }
  private begin(u: FakeUtterance) {
    if (!this.autoStart) return;
    this.speaking = true;
    u.onstart?.();
  }
  cancel() {
    this.cancelCalls++;
    const playing = this.current;
    this.queue = [];
    this.pending = false;
    this.speaking = false;
    this.current = null;
    playing?.onerror?.({ error: "interrupted" });
  }
  current: FakeUtterance | null = null;
  finish(u: FakeUtterance) {
    this.speaking = false;
    u.onend?.();
  }
}

let synth: FakeSynth;
let mod: typeof import("@/lib/audio/speech");

async function load() {
  vi.resetModules(); // the module keeps request/voice state, so every test gets a clean copy
  mod = await import("@/lib/audio/speech");
}

beforeEach(async () => {
  vi.useFakeTimers();
  synth = new FakeSynth();
  // track which utterance is "current" for cancel() events
  const speak = synth.speak.bind(synth);
  synth.speak = (u: FakeUtterance) => {
    speak(u);
    if (synth.speaking && !synth.queue.includes(u)) synth.current = u;
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  await load();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("speakSpanish", () => {
  it("starts speaking immediately on a click when the engine is idle", () => {
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    expect(mod.speakSpanish("Hola")).toBe(true);
    expect(synth.spoken.map((u) => u.text)).toEqual(["Hola"]); // no timers needed: no delay on the first click
    expect(synth.cancelCalls).toBe(0); // and no needless cancel() before speak()
  });

  it("selects a Spain-Spanish voice, then any Spanish voice, and otherwise falls back to the default", () => {
    synth.voices = [
      { lang: "en-US", name: "Alex" }, { lang: "es-MX", name: "Paulina" }, { lang: "es-ES", name: "Monica" },
    ];
    mod.speakSpanish("Hola");
    expect(synth.spoken[0].voice).toEqual({ lang: "es-ES", name: "Monica" });
    expect(synth.spoken[0].lang).toBe("es-ES");

    synth.cancel();
    synth.voices = [{ lang: "en-US", name: "Alex" }, { lang: "es-MX", name: "Paulina" }];
    mod.speakSpanish("Adiós");
    vi.advanceTimersByTime(100);
    expect(synth.spoken.at(-1)?.voice).toEqual({ lang: "es-MX", name: "Paulina" });

    synth.cancel();
    synth.voices = [{ lang: "en-US", name: "Alex" }]; // no Spanish voice at all
    mod.speakSpanish("Gracias");
    vi.advanceTimersByTime(100);
    expect(synth.spoken.at(-1)?.voice).toBeNull(); // the browser default speaks it...
    expect(synth.spoken.at(-1)?.lang).toBe("es-ES"); // ...asked for Spanish
  });

  it("waits for voices that load later instead of failing silently, then uses the Spanish one", () => {
    expect(synth.getVoices()).toHaveLength(0); // first use: the list is still empty
    mod.speakSpanish("Hola");
    expect(synth.spoken).toHaveLength(0); // waiting, not dropped
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    synth.fireVoicesChanged();
    vi.advanceTimersByTime(0);
    return Promise.resolve().then(() => {
      expect(synth.spoken.map((u) => u.text)).toEqual(["Hola"]);
      expect(synth.spoken[0].voice?.name).toBe("Monica");
    });
  });

  it("stops waiting after a moment when no voice list ever arrives, and speaks with the default", async () => {
    mod.speakSpanish("Hola");
    expect(synth.spoken).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(700);
    expect(synth.spoken.map((u) => u.text)).toEqual(["Hola"]);
    expect(synth.spoken[0].voice).toBeNull();
    mod.speakSpanish("Gracias"); // voices are settled now: no second wait
    await vi.advanceTimersByTimeAsync(100);
    expect(synth.spoken.map((u) => u.text)).toContain("Gracias");
  });

  it("replaces what is playing instead of queueing: repeated clicks never accumulate", async () => {
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    const ends: number[] = [];
    mod.speakSpanish("Uno", () => ends.push(1));
    mod.speakSpanish("Dos", () => ends.push(2));
    mod.speakSpanish("Tres", () => ends.push(3));
    mod.speakSpanish("Cuatro", () => ends.push(4));
    await vi.advanceTimersByTimeAsync(200);
    expect(synth.maxQueued).toBe(0); // nothing ever waited behind another utterance
    expect(synth.spoken.at(-1)?.text).toBe("Cuatro"); // the latest click is what is heard
    expect(synth.spoken.map((u) => u.text)).not.toContain("Dos"); // a request replaced while still waiting never reaches the engine
    expect(ends).toContain(1); // the replaced utterance reported its end (so a button can clear its state)
  });

  it("does not call speak() in the same tick as cancel() (Chromium drops it) when replacing", () => {
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    mod.speakSpanish("Uno");
    expect(synth.spoken).toHaveLength(1);
    mod.speakSpanish("Dos");
    expect(synth.cancelCalls).toBe(1);
    expect(synth.spoken).toHaveLength(1); // not yet: it waits a beat after cancelling
    vi.advanceTimersByTime(80);
    expect(synth.spoken).toHaveLength(2);
  });

  it("resumes an engine that was left paused", () => {
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    synth.paused = true;
    mod.speakSpanish("Hola");
    expect(synth.resumeCalls).toBe(1);
  });

  it("kicks a stuck engine once: if speech never starts it cancels, resumes and tries again", async () => {
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    synth.autoStart = false; // accepted but never starts
    mod.speakSpanish("Hola");
    expect(synth.spoken).toHaveLength(1);
    synth.autoStart = true; // the engine recovers
    await vi.advanceTimersByTimeAsync(1100);
    expect(synth.cancelCalls).toBe(1);
    expect(synth.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe("Hola");
    await vi.advanceTimersByTimeAsync(5000);
    expect(synth.spoken).toHaveLength(2); // exactly one retry, no loop
  });

  it("retries a transient engine error once, but never loops", async () => {
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    mod.speakSpanish("Hola");
    synth.spoken[0].onerror?.({ error: "synthesis-failed" });
    await vi.advanceTimersByTimeAsync(100);
    expect(synth.spoken).toHaveLength(2);
    synth.spoken[1].onerror?.({ error: "synthesis-failed" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(synth.spoken).toHaveLength(2);
  });

  it("never throws when the engine fails, reports the end, and a later click can try again", () => {
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    synth.failNextSpeak = true;
    const onEnd = vi.fn();
    expect(() => mod.speakSpanish("Hola", onEnd)).not.toThrow();
    expect(onEnd).toHaveBeenCalledTimes(1); // so a button does not stay stuck "playing"
    expect(() => mod.speakSpanish("Hola")).not.toThrow(); // the retry is just another click
    expect(synth.spoken.map((u) => u.text)).toEqual(["Hola"]);
  });

  it("swallows exceptions thrown by the caller's onEnd listener", () => {
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    mod.speakSpanish("Hola", () => {
      throw new Error("listener bug");
    });
    expect(() => synth.finish(synth.spoken[0])).not.toThrow();
  });

  it("cancelSpeech drops a request that is still waiting for voices", async () => {
    mod.speakSpanish("Hola"); // waiting for voices
    mod.cancelSpeech();
    synth.voices = [{ lang: "es-ES", name: "Monica" }];
    synth.fireVoicesChanged();
    await vi.advanceTimersByTimeAsync(700);
    expect(synth.spoken).toHaveLength(0);
  });

  it("reports unsupported browsers and empty text without touching the engine", () => {
    expect(mod.speakSpanish("   ")).toBe(false);
    vi.unstubAllGlobals();
    expect(mod.isSpeechSupported()).toBe(false);
    expect(mod.speakSpanish("Hola")).toBe(false);
    expect(() => mod.cancelSpeech()).not.toThrow();
    expect(() => mod.primeSpeech()).not.toThrow();
  });
});
