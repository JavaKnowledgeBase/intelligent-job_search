from __future__ import annotations

from io import BytesIO
import os

from docx import Document
from fastapi.testclient import TestClient

os.environ["OPENAI_API_KEY"] = ""

from app.main import app  # noqa: E402


client = TestClient(app)


def create_session() -> dict:
    response = client.post("/sessions")
    assert response.status_code == 200
    return response.json()


def test_full_resume_flow_supports_exports() -> None:
    session = create_session()
    session_id = session["session_id"]

    intake = client.post(
        f"/sessions/{session_id}/intake",
        json={
            "brain_dump": (
                "I worked in operations, customer support, and coordination roles. "
                "I used Excel, CRM tools, and ticketing systems. "
                "I improved workflows and kept customers updated."
            )
        },
    )
    assert intake.status_code == 200
    assert intake.json()["status"] == "intake_complete"
    assert intake.json()["facts"]

    questions = client.post(f"/sessions/{session_id}/questions")
    assert questions.status_code == 200
    assert questions.json()["status"] == "questions_ready"
    assert len(questions.json()["questions"]) >= 3

    answers = client.post(
        f"/sessions/{session_id}/answers",
        json={
            "answers": {
                "impact": "Reduced response times and improved team handoffs",
                "tools": "Excel, CRM, ticketing systems",
                "target": "operations coordinator",
            }
        },
    )
    assert answers.status_code == 200

    resume = client.post(f"/sessions/{session_id}/resume")
    assert resume.status_code == 200
    resume_payload = resume.json()
    assert resume_payload["status"] == "resume_ready"
    assert resume_payload["resume_draft"]["markdown"]
    assert resume_payload["transcript"]

    review = client.post(f"/sessions/{session_id}/review")
    assert review.status_code == 200
    assert review.json()["review_result"]["markdown"]

    finalize = client.post(
        f"/sessions/{session_id}/finalize",
        json={"change_request": "Make the summary sound more confident."},
    )
    assert finalize.status_code == 200
    assert finalize.json()["final_resume"]["markdown"]

    export_json = client.get(f"/sessions/{session_id}/export/json")
    assert export_json.status_code == 200
    assert export_json.json()["final_resume"] is not None

    export_pdf = client.get(f"/sessions/{session_id}/export/pdf")
    assert export_pdf.status_code == 200
    assert export_pdf.headers["content-type"] == "application/pdf"
    assert len(export_pdf.content) > 1000

    export_docx = client.get(f"/sessions/{session_id}/export/docx")
    assert export_docx.status_code == 200
    assert (
        export_docx.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert len(export_docx.content) > 1000


def test_updating_facts_clears_generated_outputs() -> None:
    session = create_session()
    session_id = session["session_id"]

    client.post(
        f"/sessions/{session_id}/intake",
        json={"brain_dump": "I worked in operations support and customer communication."},
    )
    client.post(f"/sessions/{session_id}/questions")
    client.post(
        f"/sessions/{session_id}/answers",
        json={"answers": {"impact": "Improved workflow visibility"}},
    )
    client.post(f"/sessions/{session_id}/resume")

    updated = client.post(
        f"/sessions/{session_id}/facts",
        json={"facts": [{"label": "Core Strength", "value": "Workflow improvement"}]},
    )
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["facts"] == [{"label": "Core Strength", "value": "Workflow improvement"}]
    assert payload["resume_draft"] is None
    assert payload["review_result"] is None
    assert payload["final_resume"] is None
    assert payload["transcript"] == ""


def test_docx_upload_extracts_text() -> None:
    document = Document()
    document.add_paragraph("Sample uploaded resume text")
    buffer = BytesIO()
    document.save(buffer)

    response = client.post(
        "/uploads/extract",
        files={
            "file": (
                "sample.docx",
                buffer.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 200
    assert response.json()["extracted_text"] == "Sample uploaded resume text"
