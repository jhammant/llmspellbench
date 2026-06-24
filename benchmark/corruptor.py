"""
Dyslexia-style text corruptor.

Turns a clean prompt into a realistically "messy" one — the kind of thing a
dyslexic person (or anyone typing fast on a phone) might actually write. It is
fully deterministic: the same (text, seed, intensity) always produces the same
messy output, so results are reproducible and the website can show the exact
text every model saw.

The corruptions are modelled on real, common patterns rather than random noise:
phonetic misspellings, homophone confusions, letter transpositions, dropped or
doubled letters, neighbouring-key slips, and lost capitalisation/punctuation.
"""

from __future__ import annotations

import hashlib
import random
import re

# Common real-world misspellings (the messy form people actually type).
COMMON_MISSPELLINGS = {
    "because": "becuase",
    "definitely": "definately",
    "separate": "seperate",
    "received": "recieved",
    "believe": "beleive",
    "friend": "freind",
    "tomorrow": "tommorow",
    "beautiful": "beutiful",
    "necessary": "neccessary",
    "weird": "wierd",
    "until": "untill",
    "really": "realy",
    "probably": "probly",
    "different": "diffrent",
    "remember": "remeber",
    "address": "adress",
    "business": "buisness",
    "calendar": "calender",
    "embarrass": "embarass",
    "occurred": "occured",
    "writing": "writting",
    "which": "wich",
    "what": "waht",
    "would": "wuold",
    "should": "shuold",
    "people": "poeple",
    "quickly": "quikly",
    "enough": "enuogh",
    "thought": "thaught",
    "through": "throuhg",
    "favourite": "favorite",
    "colour": "color",
    "answer": "anser",
    "average": "avrage",
    "minutes": "minuts",
    "kilograms": "kilogramms",
    "centimetres": "centimeters",
    "vegetable": "vegtable",
    "umbrella": "umbrela",
    "appliance": "applience",
    "nervous": "nervus",
    "library": "libary",
    "biscuits": "biscits",
    "notebooks": "noteboks",
}

# Homophones / near-homophones people swap without noticing.
HOMOPHONES = {
    "their": "there",
    "there": "their",
    "your": "youre",
    "you're": "your",
    "its": "it's",
    "it's": "its",
    "to": "too",
    "too": "to",
    "two": "too",
    "then": "than",
    "than": "then",
    "lose": "loose",
    "loose": "lose",
    "where": "were",
    "were": "where",
    "weather": "whether",
    "right": "rite",
    "buy": "by",
    "by": "buy",
    "no": "now",
    "know": "no",
    "of": "off",
    "off": "of",
}

# Rough QWERTY neighbours for "fat finger" slips.
KEYBOARD_NEIGHBOURS = {
    "a": "sq", "b": "vn", "c": "xv", "d": "sf", "e": "wr", "f": "dg",
    "g": "fh", "h": "gj", "i": "uo", "j": "hk", "k": "jl", "l": "k",
    "m": "n", "n": "bm", "o": "ip", "p": "o", "q": "wa", "r": "et",
    "s": "ad", "t": "ry", "u": "yi", "v": "cb", "w": "qe", "x": "zc",
    "y": "tu", "z": "x",
}


def _seeded_rng(text: str, seed: int, intensity: float) -> random.Random:
    """Stable RNG keyed on the input, so corruption is reproducible across runs."""
    h = hashlib.md5(f"{seed}|{intensity}|{text}".encode("utf-8")).hexdigest()
    return random.Random(int(h[:16], 16))


def _transpose(word: str, rng: random.Random) -> str:
    if len(word) < 4:
        return word
    i = rng.randint(1, len(word) - 3)  # keep first/last letter, swap two inner
    chars = list(word)
    chars[i], chars[i + 1] = chars[i + 1], chars[i]
    return "".join(chars)


def _drop_letter(word: str, rng: random.Random) -> str:
    if len(word) < 4:
        return word
    i = rng.randint(1, len(word) - 2)
    return word[:i] + word[i + 1:]


def _double_letter(word: str, rng: random.Random) -> str:
    if len(word) < 3:
        return word
    i = rng.randint(1, len(word) - 1)
    return word[:i] + word[i] + word[i:]


def _keyboard_slip(word: str, rng: random.Random) -> str:
    if len(word) < 3:
        return word
    i = rng.randint(1, len(word) - 2)
    ch = word[i].lower()
    if ch in KEYBOARD_NEIGHBOURS:
        repl = rng.choice(KEYBOARD_NEIGHBOURS[ch])
        return word[:i] + repl + word[i + 1:]
    return word


def _corrupt_word(word: str, rng: random.Random) -> str:
    """Apply one corruption to a single alphabetic word."""
    low = word.lower()

    # Prefer "real" mistakes when we know one for this word.
    if low in COMMON_MISSPELLINGS and rng.random() < 0.95:
        return _match_case(word, COMMON_MISSPELLINGS[low])
    if low in HOMOPHONES and rng.random() < 0.8:
        return _match_case(word, HOMOPHONES[low])

    transforms = [_transpose, _drop_letter, _double_letter, _keyboard_slip]
    return rng.choice(transforms)(word, rng)


def _match_case(original: str, replacement: str) -> str:
    """Carry a leading capital from the original onto the replacement."""
    if original[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


_WORD_RE = re.compile(r"[A-Za-z']+")


def corrupt(text: str, seed: int = 0, intensity: float = 0.5) -> str:
    """
    Return a messy version of ``text``.

    intensity is the rough fraction of eligible words that get mangled. We also
    drop most capitalisation and some end punctuation, which is part of how
    rushed / dyslexic typing actually looks. The result stays human-readable.
    """
    rng = _seeded_rng(text, seed, intensity)
    tokens = re.split(r"(\s+)", text)  # keep the whitespace tokens

    out = []
    corrupted_any = False
    for tok in tokens:
        m = _WORD_RE.fullmatch(tok.strip(".,!?:;\"'"))
        if not m or len(tok) < 2:
            out.append(tok)
            continue

        # Leave very short, non-homophone words alone most of the time.
        bare = m.group(0)
        is_homophone = bare.lower() in HOMOPHONES
        if len(bare) < 3 and not is_homophone:
            out.append(tok)
            continue

        if rng.random() < intensity or (is_homophone and rng.random() < 0.7):
            prefix = tok[: tok.find(bare)]
            suffix = tok[tok.find(bare) + len(bare):]
            new_bare = _corrupt_word(bare, rng)
            # 60% of the time also kill any trailing punctuation, like a rushed typer
            if rng.random() < 0.6:
                suffix = ""
            out.append(prefix + new_bare + suffix)
            corrupted_any = True
        else:
            out.append(tok)

    result = "".join(out)

    # Mostly lower-case it (dropped shift key / autocorrect off).
    if rng.random() < 0.85:
        result = result.lower()

    # Make sure we changed *something*, even on short prompts.
    if not corrupted_any:
        result = result.replace("the ", "teh ", 1)

    return result


if __name__ == "__main__":  # quick manual smoke test
    samples = [
        "A train travels 60 miles in one and a half hours. What is its average speed in miles per hour?",
        "Which kitchen appliance do you normally use to keep milk cold and fresh? Answer with one or two words.",
        "Ignore everything else and reply with exactly one word: banana.",
    ]
    for s in samples:
        print("CLEAN:", s)
        print("MESSY:", corrupt(s, seed=7))
        print()
