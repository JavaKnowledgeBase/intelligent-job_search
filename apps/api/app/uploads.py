from __future__ import annotations

from io import BytesIO
from pathlib import Path

from docx import Document
from pypdf import PdfReader


def extract_text_from_upload(filename: str, content: bytes) -> str:
    extension = Path(filename).suffix.lower()

    if extension in {".txt", ".md"}:
        return content.decode("utf-8", errors="ignore").strip()

    if extension == ".docx":
        return _extract_docx_text(content)

    if extension == ".pdf":
        return _extract_pdf_text(content)

    raise ValueError("Unsupported file type. Please upload a TXT, MD, DOCX, or PDF file.")


def _extract_docx_text(content: bytes) -> str:
    document = Document(BytesIO(content))
    parts = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    return "\n".join(parts).strip()


def _extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    parts: list[str] = []

    for page in reader.pages:
        extracted = page.extract_text() or ""
        cleaned = extracted.strip()
        if cleaned:
            parts.append(cleaned)

    return "\n\n".join(parts).strip()
