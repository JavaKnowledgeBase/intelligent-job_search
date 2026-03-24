from __future__ import annotations

from io import BytesIO
from pathlib import Path

from docx import Document
from pypdf import PdfReader

from .safety import sanitize_user_text, validate_file_upload


def extract_text_from_upload(filename: str, content: bytes) -> str:
    validate_file_upload(filename, content)
    extension = Path(filename).suffix.lower()

    if extension in {".txt", ".md"}:
        return sanitize_user_text(content.decode("utf-8", errors="ignore"))

    if extension == ".docx":
        return _extract_docx_text(content)

    if extension == ".pdf":
        return _extract_pdf_text(content)

    raise ValueError("Unsupported file type. Please upload a TXT, MD, DOCX, or PDF file.")


def _extract_docx_text(content: bytes) -> str:
    document = Document(BytesIO(content))
    parts = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    return sanitize_user_text("\n".join(parts))


def _extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    if reader.is_encrypted:
        raise ValueError("Encrypted PDF files are not supported.")
    parts: list[str] = []

    for page in reader.pages:
        extracted = page.extract_text() or ""
        cleaned = extracted.strip()
        if cleaned:
            parts.append(cleaned)

    return sanitize_user_text("\n\n".join(parts))
