import pytest

from app.services.evaluation import AnswerPayload, InvalidAnswerError, check_pair, evaluate, normalize


def test_normalize_ignores_case_punctuation_and_accents_but_not_enye():
    assert normalize("  ¿Cómo   TE llamas? ") == "como te llamas"
    assert normalize("año") != normalize("ano")


def test_multiple_choice():
    key = {"option_id": "b"}
    assert evaluate("multiple_choice", key, AnswerPayload(option_id="b"))
    assert not evaluate("multiple_choice", key, AnswerPayload(option_id="a"))
    with pytest.raises(InvalidAnswerError):
        evaluate("multiple_choice", key, AnswerPayload())


def test_translate_accepts_alternatives_and_rejects_wrong_order():
    key = {"accepted": [["Ella", "es", "feliz"], ["Ella", "está", "feliz"]]}
    assert evaluate("translate", key, AnswerPayload(tokens=["ella", "está", "feliz"]))
    assert not evaluate("translate", key, AnswerPayload(tokens=["es", "Ella", "feliz"]))
    with pytest.raises(InvalidAnswerError):
        evaluate("translate", key, AnswerPayload(tokens=[]))


def test_match_pairs_requires_exact_mapping_without_duplicates():
    key = {"pairs": {"l0": "r0", "l1": "r1"}}
    good = [{"left_id": "l0", "right_id": "r0"}, {"left_id": "l1", "right_id": "r1"}]
    assert evaluate("match_pairs", key, AnswerPayload(pairs=good))
    swapped = [{"left_id": "l0", "right_id": "r1"}, {"left_id": "l1", "right_id": "r0"}]
    assert not evaluate("match_pairs", key, AnswerPayload(pairs=swapped))
    dup = good + [{"left_id": "l0", "right_id": "r0"}]
    assert not evaluate("match_pairs", key, AnswerPayload(pairs=dup))
    assert not evaluate("match_pairs", key, AnswerPayload(pairs=good[:1]))


@pytest.mark.parametrize("kind", ["fill_blank", "type_answer"])
def test_text_answers(kind):
    key = {"accepted": ["¿Cómo te llamas?"]}
    assert evaluate(kind, key, AnswerPayload(text="como te llamas"))
    assert not evaluate(kind, key, AnswerPayload(text="como te llamo"))
    with pytest.raises(InvalidAnswerError):
        evaluate(kind, key, AnswerPayload(text="   "))


def test_check_pair():
    key = {"pairs": {"l0": "r2"}}
    assert check_pair(key, "l0", "r2")
    assert not check_pair(key, "l0", "r1")
