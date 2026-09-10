"""Human-facing names for stable lookup identifiers."""

import re


_DISPLAY_NAME_OVERRIDES = {
    "high_quality_pesudo": "High Quality Pseudo",
    "low_quality_pesudo": "Low Quality Pseudo",
    "og": "OG",
}
_ROMAN_RANKS = {"i", "ii", "iii", "iv", "v"}
_IDENTIFIER = re.compile(r"\b[a-z0-9]+(?:_[a-z0-9+]+)+\b")


def humanize_identifier(identifier: str) -> str:
    """Turn an internal snake-case identifier into a readable label."""
    if not isinstance(identifier, str):
        return identifier
    if identifier in _DISPLAY_NAME_OVERRIDES:
        return _DISPLAY_NAME_OVERRIDES[identifier]

    words = []
    for word in identifier.split("_"):
        suffix = "+" if word.endswith("+") else ""
        base = word.removesuffix("+")
        if base == "og" or base in _ROMAN_RANKS:
            words.append(base.upper() + suffix)
        else:
            words.append(base.title() + suffix)
    return " ".join(words)


def object_display_name(value) -> str:
    """Prefer an explicit model label and otherwise humanize its stable name."""
    return value.display_name or humanize_identifier(value.name)


def humanize_message(message: str) -> str:
    """Keep technical snake-case tokens out of human-facing error messages."""
    return _IDENTIFIER.sub(lambda match: humanize_identifier(match.group()), message)
