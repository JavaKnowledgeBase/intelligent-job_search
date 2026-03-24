from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from .models import ResumeFact

MAX_TEXT_LENGTH = 20_000
MAX_ANSWER_LENGTH = 4_000
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")
_MULTI_BREAK = re.compile(r"\n{3,}")
_SCRIPT_BLOCK = re.compile(r"<\s*(script|style|iframe|object|embed)[^>]*>.*?<\s*/\s*\1\s*>", re.IGNORECASE | re.DOTALL)
_HTML_TAG = re.compile(r"<[^>\n]{1,200}>")
_JS_URI = re.compile(r"javascript\s*:", re.IGNORECASE)
_PROMPT_INJECTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"(?:^|[\s,;])ignore (all|any|the)?\s*(previous|prior) instructions[^.!?\n]*",
        r"(?:^|[\s,;])disregard (all|any|the)?\s*(previous|prior) instructions[^.!?\n]*",
        r"(?:^|[\s,;])override (all|any|the)?\s*instructions[^.!?\n]*",
        r"(?:^|[\s,;])(?:print|reveal|show)\s+the\s+(system prompt|developer message|hidden instruction)[^.!?\n]*",
        r"(?:^|[\s,;])do not follow the above[^.!?\n]*",
        r"(?:^|[\s,;])forget the above[^.!?\n]*",
    ]
]
_PROFANITY_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"\bfuck(?:ing|ed|er|s)?\b",
        r"\bshit(?:ty|ted|ting|s)?\b",
        r"\bbitch(?:es)?\b",
        r"\basshole(?:s)?\b",
        r"\bdamn\b",
        r"\bcrap\b",
    ]
]
_UNPROFESSIONAL_REPLACEMENTS = {
    "sucks": "needs improvement",
    "lazy": "insufficiently responsive",
    "stupid": "inefficient",
    "idiot": "difficult stakeholder",
    "jerk": "challenging counterpart",
    "hate": "strongly disliked",
}
_MARKDOWN_LINE_PREFIXES = ("# ", "## ", "### ", "- ", "* ")
_THREAT_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"\bkill\b",
        r"\battack\b",
        r"\bexplosive\b",
        r"\bmalware\b",
        r"\bransomware\b",
        r"\bpayload\b",
    ]
]


def sanitize_user_text(text: str, *, max_length: int = MAX_TEXT_LENGTH) -> str:
    normalized = _normalize_text(text, max_length=max_length)
    normalized = _remove_markup(normalized)
    normalized = _remove_instruction_like_text(normalized)
    normalized = _soften_unprofessional_language(normalized)
    return normalized.strip()


def sanitize_markdown_output(text: str, *, max_length: int = MAX_TEXT_LENGTH) -> str:
    normalized = _normalize_text(text, max_length=max_length)
    normalized = _remove_markup(normalized)
    normalized = _remove_instruction_like_text(normalized)
    normalized = _soften_unprofessional_language(normalized)

    safe_lines: list[str] = []
    for raw_line in normalized.splitlines():
        line = raw_line.rstrip()
        stripped = line.lstrip()
        if not stripped:
            safe_lines.append("")
            continue

        prefix = ""
        content = stripped
        for candidate in _MARKDOWN_LINE_PREFIXES:
            if stripped.startswith(candidate):
                prefix = candidate
                content = stripped[len(candidate):]
                break

        content = _MULTI_SPACE.sub(" ", content).strip(" -\t")
        if not content:
            continue
        safe_lines.append(f"{prefix}{content}".rstrip())

    return _MULTI_BREAK.sub("\n\n", "\n".join(safe_lines)).strip()


def sanitize_answer_map(answers: dict[str, str]) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for key, value in answers.items():
        safe_key = _normalize_text(str(key), max_length=80).lower().replace(" ", "_")
        safe_value = sanitize_user_text(str(value), max_length=MAX_ANSWER_LENGTH)
        if safe_key and safe_value:
            cleaned[safe_key] = safe_value
    return cleaned


def sanitize_facts(facts: list[ResumeFact]) -> list[ResumeFact]:
    cleaned: list[ResumeFact] = []
    for fact in facts:
        label = _normalize_text(fact.label, max_length=80)
        value = sanitize_user_text(fact.value, max_length=600)
        if label and value:
            cleaned.append(ResumeFact(label=label, value=value))
    return cleaned


def validate_file_upload(filename: str, content: bytes) -> None:
    extension = Path(filename).suffix.lower()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise ValueError("File is too large. Please keep uploads under 5 MB.")

    if extension not in {".txt", ".md", ".docx", ".pdf"}:
        raise ValueError("Unsupported file type. Please upload a TXT, MD, DOCX, or PDF file.")

    if extension == ".docx" and not content.startswith(b"PK"):
        raise ValueError("That DOCX file appears to be invalid or unsafe.")

    if extension == ".pdf" and not content.startswith(b"%PDF-"):
        raise ValueError("That PDF file appears to be invalid or unsafe.")


def validate_audio_upload(filename: str, content: bytes) -> None:
    if len(content) > MAX_AUDIO_SIZE_BYTES:
        raise ValueError("Audio file is too large. Please keep uploads under 10 MB.")

    extension = Path(filename).suffix.lower()
    if extension not in {".wav", ".mp3", ".m4a", ".webm", ".mp4", ".mpeg", ".mpga"}:
        raise ValueError("Unsupported audio format.")


def classify_text_content(text: str) -> list[str]:
    notes: list[str] = []
    raw_text = text or ""

    if _SCRIPT_BLOCK.search(raw_text) or _HTML_TAG.search(raw_text) or _JS_URI.search(raw_text):
        notes.append("Potential embedded markup or script content was detected and removed.")

    if any(pattern.search(raw_text) for pattern in _PROMPT_INJECTION_PATTERNS):
        notes.append("Instruction-like or prompt-injection-style content was detected and removed.")

    if any(pattern.search(raw_text) for pattern in _PROFANITY_PATTERNS):
        notes.append("Unprofessional language was detected and softened before further processing.")

    lowered = raw_text.lower()
    if any(word in lowered for word in _UNPROFESSIONAL_REPLACEMENTS):
        notes.append("Informal or adversarial wording was normalized for a more professional tone.")

    if any(pattern.search(raw_text) for pattern in _THREAT_PATTERNS):
        notes.append("Potentially harmful or security-related language was detected. Review with caution.")

    return _dedupe_notes(notes)


def collect_session_moderation_notes(brain_dump: str, answers: dict[str, str]) -> list[str]:
    notes = classify_text_content(brain_dump)
    for value in answers.values():
        notes.extend(classify_text_content(value))
    return _dedupe_notes(notes)


def _normalize_text(text: str, *, max_length: int) -> str:
    normalized = unicodedata.normalize("NFKC", text or "")
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = _CONTROL_CHARS.sub("", normalized)
    normalized = _MULTI_SPACE.sub(" ", normalized)
    normalized = _MULTI_BREAK.sub("\n\n", normalized)
    normalized = normalized.strip()
    if len(normalized) > max_length:
        normalized = normalized[:max_length].rstrip()
    return normalized


def _remove_markup(text: str) -> str:
    text = _SCRIPT_BLOCK.sub("[embedded code removed]", text)
    text = _JS_URI.sub("", text)
    return _HTML_TAG.sub("", text)


def _remove_instruction_like_text(text: str) -> str:
    cleaned = text
    for pattern in _PROMPT_INJECTION_PATTERNS:
        cleaned = pattern.sub("[instruction-like content removed]", cleaned)
    return cleaned


def _soften_unprofessional_language(text: str) -> str:
    cleaned = text
    for pattern in _PROFANITY_PATTERNS:
        cleaned = pattern.sub("unprofessional wording removed", cleaned)

    for source, replacement in _UNPROFESSIONAL_REPLACEMENTS.items():
        cleaned = re.sub(rf"\b{re.escape(source)}\b", replacement, cleaned, flags=re.IGNORECASE)

    return cleaned


def _dedupe_notes(notes: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for note in notes:
        cleaned = note.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)
    return deduped
