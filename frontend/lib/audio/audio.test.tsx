import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { pickSpanishVoice } from "@/lib/audio/speech";
import { answerSpeech, promptSpeech } from "@/lib/audio/speakable";
import type { AnswerResult, Exercise, Learner } from "@/lib/types/api";

const learner = {} as Learner;
const verdict = (over: Partial<AnswerResult>): AnswerResult => ({
  correct: true, already_solved: false, xp_awarded: 0, heart_lost: false, out_of_hearts: false,
  correct_answer: null, explanation: null, learner, ...over,
});

const mc = (prompt: string): Exercise => ({
  id: 1, position: 1, prompt, type: "multiple_choice",
  payload: { options: [{ id: "a", text: "Hola" }, { id: "b", text: "Adiós" }] },
});
const translate = (direction: "to_target" | "to_source"): Exercise => ({
  id: 2, position: 2, prompt: "x", type: "translate",
  payload: { source_text: direction === "to_source" ? "Voy a la escuela" : "I go to school", direction, tokens: ["Voy", "a"] },
});
const fill: Exercise = {
  id: 3, position: 3, prompt: "Fill in the missing word", type: "fill_blank",
  payload: { before: "Voy a la ", after: ".", options: ["tienda", "rojo"], hint: "I go to the store." },
};

describe("which text can be read aloud", () => {
  it("reads the quoted Spanish term in a 'what does X mean' question", () => {
    expect(promptSpeech(mc('What does "Gracias" mean?'))).toBe("Gracias");
    expect(promptSpeech(mc('"¿Dónde?" means...'))).toBe("¿Dónde?");
  });

  it("does not read the English word of a 'how do you say' question (that would give the answer away)", () => {
    expect(promptSpeech(mc('How do you say "Hello"?'))).toBeNull();
  });

  it("reads Spanish sources of translate / type-answer exercises only", () => {
    expect(promptSpeech(translate("to_source"))).toBe("Voy a la escuela");
    expect(promptSpeech(translate("to_target"))).toBeNull();
  });

  it("offers nothing before answering for fill-in-the-blank and nothing after for a missing verdict", () => {
    expect(promptSpeech(fill)).toBeNull();
    expect(answerSpeech(fill, { text: "tienda" }, null)).toBeNull();
  });

  it("reads the finished Spanish answer after a correct answer", () => {
    expect(answerSpeech(mc('How do you say "Hello"?'), { option_id: "a" }, verdict({}))).toBe("Hola");
    expect(answerSpeech(translate("to_target"), { tokens: ["Voy", "a"] }, verdict({}))).toBe("Voy a");
    expect(answerSpeech(fill, { text: "tienda" }, verdict({}))).toBe("Voy a la tienda.");
  });

  it("reads the backend's solution after a wrong answer, never the learner's mistake", () => {
    const wrong = verdict({ correct: false, correct_answer: "Voy a la tienda." });
    expect(answerSpeech(fill, { text: "rojo" }, wrong)).toBe("Voy a la tienda.");
  });

  it("has no answer audio when the answer is English", () => {
    expect(answerSpeech(translate("to_source"), { tokens: ["I"] }, verdict({}))).toBeNull();
    expect(answerSpeech(mc('What does "Gracias" mean?'), { option_id: "a" }, verdict({}))).toBeNull();
  });
});

describe("voice choice", () => {
  it("prefers Spain Spanish, then any Spanish, then lets the browser decide", () => {
    const en = { lang: "en-US" };
    const mx = { lang: "es-MX" };
    const es = { lang: "es_ES" };
    expect(pickSpanishVoice([en, mx, es])).toBe(es);
    expect(pickSpanishVoice([en, mx])).toBe(mx);
    expect(pickSpanishVoice([en])).toBeNull();
  });
});

describe("SpeakButton", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubSynthesis() {
    const spoken: { text: string; lang: string; onend?: () => void }[] = [];
    class Utterance {
      lang = "";
      rate = 1;
      voice: unknown = null;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    }
    const synth = {
      speak: vi.fn((u: Utterance) => spoken.push(u)),
      cancel: vi.fn(),
      getVoices: () => [{ lang: "es-ES", name: "Monica" }],
    };
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    return { synth, spoken };
  }

  it("speaks the text in Spanish when pressed", async () => {
    const { synth, spoken } = stubSynthesis();
    render(<SpeakButton text="Hola" label="Listen" />);
    await userEvent.click(screen.getByRole("button", { name: /listen: hola/i }));
    expect(synth.speak).toHaveBeenCalledOnce();
    expect(spoken[0].text).toBe("Hola");
    expect(spoken[0].lang).toBe("es-ES");
    expect(screen.getByRole("button", { name: /listen: hola/i })).toHaveAttribute("aria-pressed", "true");
    spoken[0].onend?.(); // playback finished
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /listen: hola/i })).toHaveAttribute("aria-pressed", "false"));
  });

  it("stops playback when pressed again", async () => {
    const { synth } = stubSynthesis();
    render(<SpeakButton text="Hola" />);
    const button = screen.getByRole("button", { name: /listen: hola/i });
    await userEvent.click(button);
    synth.cancel.mockClear();
    await userEvent.click(button);
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledOnce();
  });

  it("is disabled with an explanation when the browser has no speech synthesis", () => {
    // jsdom has none, which is exactly the unsupported case
    render(<SpeakButton text="Hola" />);
    const button = screen.getByRole("button", { name: /isn't available/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Audio isn't available in this browser");
  });
});
