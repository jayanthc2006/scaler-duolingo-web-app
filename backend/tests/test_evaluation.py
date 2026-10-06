import pytest

from app.services.evaluation import AnswerPayload, InvalidAnswerError, check_pair, evaluate, normalize


def test_normalize_ignores_case_punctuation_and_accents_and_only_folds_enye_when_asked():
    assert normalize("  ¿Cómo   TE llamas? ") == "como te llamas"
    assert normalize("año") != normalize("ano")  # by default ñ stays distinct (word-bank tiles)
    assert normalize("año", fold_enye=True) == normalize("ano", fold_enye=True) == "ano"
    assert normalize("PEQUEÑA", fold_enye=True) == "pequena"
    assert normalize("pequeña", fold_enye=True) == "pequena"  # n + combining tilde (typed on some keyboards)


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


# ---------------------------------------------------------------- typed Spanish tolerance (ñ and accents)
@pytest.mark.parametrize("kind", ["fill_blank", "type_answer"])
def test_missing_enye_is_forgiven_in_typed_answers_both_ways(kind):
    assert evaluate(kind, {"accepted": ["pequeña"]}, AnswerPayload(text="pequena"))
    assert evaluate(kind, {"accepted": ["pequena"]}, AnswerPayload(text="pequeña"))
    assert evaluate(kind, {"accepted": ["pequeña"]}, AnswerPayload(text="pequeña"))  # exact spelling still right
    assert evaluate(kind, {"accepted": ["pequeño", "pequeña"]}, AnswerPayload(text="PEQUENA "))


@pytest.mark.parametrize("kind", ["fill_blank", "type_answer"])
def test_accented_vowel_tolerance_is_unchanged_for_typed_answers(kind):
    cases = [("está", "esta"), ("él", "EL"), ("también", "tambien"), ("adiós", "adios"), ("pingüino", "pinguino")]
    for expected, typed in cases:
        assert evaluate(kind, {"accepted": [expected]}, AnswerPayload(text=typed)), (expected, typed)
    assert evaluate(kind, {"accepted": ["¿Cómo te llamas?"]}, AnswerPayload(text="  COMO   te  llamas "))


@pytest.mark.parametrize("kind", ["fill_blank", "type_answer"])
def test_genuinely_wrong_typed_answers_stay_wrong(kind):
    key = {"accepted": ["pequeña"]}
    for typed in ["grande", "pequenas", "pequen", "pequeno a", "pequea", "peque", "pequeña2"]:
        assert not evaluate(kind, key, AnswerPayload(text=typed)), typed
    assert not evaluate(kind, {"accepted": ["niño"]}, AnswerPayload(text="nina"))  # a different word, not a missed mark


def test_word_bank_tiles_still_treat_enye_as_a_different_letter():
    key = {"accepted": [["El", "año"]]}
    assert evaluate("translate", key, AnswerPayload(tokens=["El", "año"]))
    assert not evaluate("translate", key, AnswerPayload(tokens=["El", "ano"]))  # tiles are chosen, not typed


def test_match_pairs_and_multiple_choice_ignore_text_folding():
    pairs_key = {"pairs": {"l0": "r0"}}
    assert not evaluate("match_pairs", pairs_key, AnswerPayload(pairs=[{"left_id": "l0", "right_id": "r1"}]))
    assert check_pair(pairs_key, "l0", "r0") and not check_pair(pairs_key, "l0", "r1")
    mc_key = {"option_id": "b"}
    assert evaluate("multiple_choice", mc_key, AnswerPayload(option_id="b"))
    assert not evaluate("multiple_choice", mc_key, AnswerPayload(option_id="B"))  # ids are exact, never normalised
