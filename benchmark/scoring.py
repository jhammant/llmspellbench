"""
Objective scoring. No LLM judge, no subjectivity — every task has a checkable
answer and we extract it from the model's reply with simple, auditable rules.
"""

from __future__ import annotations

import re
import string

LETTERS = ["A", "B", "C", "D", "E"]


def _light_normalize(text: str) -> str:
    """Lowercase, turn punctuation into spaces, collapse whitespace."""
    text = text.lower()
    text = text.replace("’", "'")
    table = str.maketrans({c: " " for c in string.punctuation})
    text = text.translate(table)
    return re.sub(r"\s+", " ", text).strip()


def extract_mc_letter(response: str, n_choices: int) -> str | None:
    """Find the multiple-choice letter the model picked, if any."""
    valid = set(LETTERS[:n_choices])

    # 1) An explicit standalone letter, e.g. "B", "(B)", "B)", "Answer: B".
    for m in re.finditer(r"(?<![A-Za-z])([A-Ea-e])(?![A-Za-z])", response):
        ch = m.group(1).upper()
        if ch in valid:
            return ch
    return None


def _choice_letter_for_index(i: int) -> str:
    return LETTERS[i]


def score_multiple_choice(task: dict, response: str) -> bool:
    choices = task["choices"]
    answer_letter = task["answer"].strip().upper()

    letter = extract_mc_letter(response, len(choices))
    if letter is not None:
        return letter == answer_letter

    # Fallback: the model spelled out the option text instead of the letter.
    resp = _light_normalize(response)
    answer_index = LETTERS.index(answer_letter)
    matched = []
    for i, ch in enumerate(choices):
        ch_norm = _light_normalize(ch)
        if ch_norm and re.search(rf"(?<!\w){re.escape(ch_norm)}(?!\w)", resp):
            matched.append(i)
    return matched == [answer_index]


def score_free_text(task: dict, response: str) -> bool:
    accepted = [task["answer"]] + task.get("aliases", [])
    resp = _light_normalize(response)
    for acc in accepted:
        acc_norm = _light_normalize(acc)
        if not acc_norm:
            continue
        if re.search(rf"(?<!\w){re.escape(acc_norm)}(?!\w)", resp):
            return True
    return False


def score(task: dict, response: str) -> bool:
    if response is None:
        return False
    if task["type"] == "multiple_choice":
        return score_multiple_choice(task, response)
    return score_free_text(task, response)


if __name__ == "__main__":  # tiny self-test
    mc = {"type": "multiple_choice", "choices": ["30", "40", "45", "90"], "answer": "B"}
    assert score(mc, "B") is True
    assert score(mc, "The answer is (B).") is True
    assert score(mc, "I think it's 40 mph.") is True
    assert score(mc, "C") is False
    sa = {"type": "short_answer", "answer": "8", "aliases": ["eight"]}
    assert score(sa, "8") is True
    assert score(sa, "You get 18 back") is False  # boundary: 8 != 18
    assert score(sa, "eight pounds") is True
    instr = {"type": "instruction", "answer": "banana", "aliases": []}
    assert score(instr, "Banana") is True
    assert score(instr, "apple") is False
    print("scoring self-test passed")
