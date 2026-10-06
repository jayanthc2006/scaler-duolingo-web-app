"""Small constructors that turn readable course data into Exercise rows (public payload + private key).

Shuffling is seeded from the prompt text so seeding is fully deterministic.
"""
import random
import string
import zlib
from typing import Any

ExerciseSpec = dict[str, Any]


def _rng(*parts: str) -> random.Random:
    return random.Random(zlib.crc32("|".join(parts).encode("utf8")))


def mc(prompt: str, options: list[str], correct: str, explanation: str | None = None) -> ExerciseSpec:
    ids = string.ascii_lowercase
    opts = [{"id": ids[i], "text": text} for i, text in enumerate(options)]
    correct_id = next(o["id"] for o in opts if o["text"] == correct)
    return {
        "type": "multiple_choice",
        "prompt": prompt,
        "payload": {"options": opts},
        "answer": {"option_id": correct_id, "display": correct},
        "explanation": explanation,
    }


def tr(
    source: str,
    answer: list[str],
    extra: list[str],
    *,
    alt: list[list[str]] | None = None,
    direction: str = "to_target",
    explanation: str | None = None,
) -> ExerciseSpec:
    tokens = list(dict.fromkeys(answer + extra + [t for a in (alt or []) for t in a]))
    _rng("tr", source).shuffle(tokens)
    return {
        "type": "translate",
        "prompt": "Write this in Spanish" if direction == "to_target" else "Write this in English",
        "payload": {"source_text": source, "direction": direction, "tokens": tokens},
        "answer": {"accepted": [answer] + (alt or []), "display": " ".join(answer)},
        "explanation": explanation,
    }


def pairs(items: list[tuple[str, str]], explanation: str | None = None) -> ExerciseSpec:
    left = [{"id": f"l{i}", "text": a} for i, (a, _) in enumerate(items)]
    right = [{"id": f"r{i}", "text": b} for i, (_, b) in enumerate(items)]
    _rng("pairs", items[0][0]).shuffle(right)
    return {
        "type": "match_pairs",
        "prompt": "Tap the matching pairs",
        "payload": {"left": left, "right": right},
        "answer": {
            "pairs": {f"l{i}": f"r{i}" for i in range(len(items))},
            "display": ", ".join(f"{a} = {b}" for a, b in items),
        },
        "explanation": explanation,
    }


def fill(
    before: str, after: str, correct: str, options: list[str], hint: str,
    explanation: str | None = None,
) -> ExerciseSpec:
    return {
        "type": "fill_blank",
        "prompt": "Fill in the missing word",
        "payload": {"before": before, "after": after, "options": options, "hint": hint},
        "answer": {"accepted": [correct], "display": f"{before}{correct}{after}".strip()},
        "explanation": explanation,
    }


def typ(
    source: str,
    accepted: list[str],
    *,
    direction: str = "to_target",
    explanation: str | None = None,
) -> ExerciseSpec:
    return {
        "type": "type_answer",
        "prompt": "Type this in Spanish" if direction == "to_target" else "Type this in English",
        "payload": {"source_text": source, "direction": direction},
        "answer": {"accepted": accepted, "display": accepted[0]},
        "explanation": explanation,
    }
