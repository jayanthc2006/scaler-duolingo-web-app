"""Pure answer evaluation. No database access, so it is trivially unit-testable.

Public exercise `payload` and private `answer` shapes per exercise type:

multiple_choice  payload {options:[{id,text}]}            answer {option_id, display}
translate        payload {direction, tokens:[str]}        answer {accepted:[[str]], display}
match_pairs      payload {left:[{id,text}],right:[...]}   answer {pairs:{left_id:right_id}, display}
fill_blank       payload {before, after, options:[str]}   answer {accepted:[str], display}
type_answer      payload {source_text, direction}         answer {accepted:[str], display}
"""
import re
import unicodedata

from pydantic import BaseModel, Field

from app.core.errors import AppError


class PairIn(BaseModel):
    left_id: str = Field(max_length=32)
    right_id: str = Field(max_length=32)


class AnswerPayload(BaseModel):
    """Union-style body: only the field relevant to the exercise type is read."""

    option_id: str | None = Field(default=None, max_length=32)
    tokens: list[str] | None = Field(default=None, max_length=40)
    pairs: list[PairIn] | None = Field(default=None, max_length=20)
    text: str | None = Field(default=None, max_length=300)


class InvalidAnswerError(AppError):
    status_code = 422
    code = "invalid_answer"


_ACCENT_MAP = str.maketrans("áéíóúü", "aeiouu")
_ENYE_MAP = str.maketrans("ñ", "n")
_PUNCT = re.compile(r"[¿?¡!.,;:\"“”]")


def normalize(text: str, *, fold_enye: bool = False) -> str:
    """Comparison form of a text answer: case, punctuation, spacing and the accents on áéíóúü are ignored.

    `fold_enye` also treats ñ as n. It is on only for typed / fill-in answers, where a learner without a Spanish
    keyboard should not fail on "pequena" for "pequeña"; word-bank tokens (translate) are tiles and keep ñ distinct.
    """
    text = unicodedata.normalize("NFC", text).casefold().translate(_ACCENT_MAP)
    if fold_enye:
        text = text.translate(_ENYE_MAP)
    text = _PUNCT.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def evaluate(exercise_type: str, key: dict, answer: AnswerPayload) -> bool:
    match exercise_type:
        case "multiple_choice":
            if not answer.option_id:
                raise InvalidAnswerError("option_id is required.")
            return answer.option_id == key["option_id"]
        case "translate":
            if not answer.tokens:
                raise InvalidAnswerError("tokens are required.")
            given = [normalize(t) for t in answer.tokens]
            return any(given == [normalize(t) for t in option] for option in key["accepted"])
        case "match_pairs":
            if not answer.pairs:
                raise InvalidAnswerError("pairs are required.")
            given_pairs = {p.left_id: p.right_id for p in answer.pairs}
            return len(given_pairs) == len(answer.pairs) and given_pairs == key["pairs"]
        case "fill_blank" | "type_answer":
            if answer.text is None or not normalize(answer.text):
                raise InvalidAnswerError("text is required.")
            return normalize(answer.text, fold_enye=True) in {normalize(a, fold_enye=True) for a in key["accepted"]}
        case _:
            raise InvalidAnswerError(f"Unknown exercise type: {exercise_type}")


def check_pair(key: dict, left_id: str, right_id: str) -> bool:
    """Single-pair probe used by the match-pairs UI for instant per-tile feedback."""
    return key["pairs"].get(left_id) == right_id
