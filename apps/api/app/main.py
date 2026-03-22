from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse

from .exporters import markdown_to_docx, markdown_to_pdf
from .models import (
    AnswersRequest,
    FactsRequest,
    IntakeRequest,
    RevisionRequest,
    SessionState,
    UploadExtractResponse,
)
from .services import apply_revision, build_resume, build_transcript, extract_facts, generate_questions, review_resume
from .store import MemorySessionStore
from .uploads import extract_text_from_upload

app = FastAPI(title="Resume Co-Pilot API")
store = MemorySessionStore()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_session(session_id: str) -> SessionState:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return session


def get_resume_markdown(session: SessionState) -> str:
    if session.final_resume is not None:
        return session.final_resume.markdown
    if session.review_result is not None:
        return session.review_result.markdown
    if session.resume_draft is not None:
        return session.resume_draft.markdown
    raise HTTPException(status_code=400, detail="No resume is ready to export yet")


def clear_generated_outputs(session: SessionState) -> None:
    session.resume_draft = None
    session.transcript = ""
    session.review_result = None
    session.final_resume = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/sessions", response_model=SessionState)
def create_session() -> SessionState:
    return store.create()


@app.post("/uploads/extract", response_model=UploadExtractResponse)
async def extract_upload(file: UploadFile = File(...)) -> UploadExtractResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="A filename is required")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")

    try:
        extracted_text = extract_text_from_upload(file.filename, content)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail="Could not read that file") from err

    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="No readable text was found in that file")

    return UploadExtractResponse(file_name=file.filename, extracted_text=extracted_text)


@app.get("/sessions/{session_id}", response_model=SessionState)
def get_session(session_id: str) -> SessionState:
    return require_session(session_id)


@app.post("/sessions/{session_id}/intake", response_model=SessionState)
def intake(session_id: str, payload: IntakeRequest) -> SessionState:
    session = require_session(session_id)
    session.brain_dump = payload.brain_dump
    session.facts = extract_facts(payload.brain_dump)
    clear_generated_outputs(session)
    session.status = "intake_complete"
    return store.save(session)


@app.post("/sessions/{session_id}/questions", response_model=SessionState)
def questions(session_id: str) -> SessionState:
    session = require_session(session_id)
    session.questions = generate_questions(session)
    clear_generated_outputs(session)
    session.status = "questions_ready"
    return store.save(session)


@app.post("/sessions/{session_id}/facts", response_model=SessionState)
def update_facts(session_id: str, payload: FactsRequest) -> SessionState:
    session = require_session(session_id)
    session.facts = [fact for fact in payload.facts if fact.label.strip() and fact.value.strip()]
    clear_generated_outputs(session)
    if session.questions:
        session.status = "questions_ready"
    else:
        session.status = "intake_complete"
    return store.save(session)


@app.post("/sessions/{session_id}/answers", response_model=SessionState)
def answers(session_id: str, payload: AnswersRequest) -> SessionState:
    session = require_session(session_id)
    session.answers.update(payload.answers)
    session.resume_draft = None
    session.transcript = ""
    session.review_result = None
    session.final_resume = None
    return store.save(session)


@app.post("/sessions/{session_id}/resume", response_model=SessionState)
def resume(session_id: str) -> SessionState:
    session = require_session(session_id)
    session.resume_draft = build_resume(session)
    session.transcript = build_transcript(session)
    session.status = "resume_ready"
    return store.save(session)


@app.post("/sessions/{session_id}/review", response_model=SessionState)
def review(session_id: str) -> SessionState:
    session = require_session(session_id)
    session.review_result = review_resume(session)
    session.status = "review_ready"
    return store.save(session)


@app.post("/sessions/{session_id}/finalize", response_model=SessionState)
def finalize(session_id: str, payload: RevisionRequest) -> SessionState:
    session = require_session(session_id)
    session.final_resume = apply_revision(session, payload.change_request)
    session.status = "final_ready"
    return store.save(session)


@app.get("/sessions/{session_id}/export/docx")
def export_docx(session_id: str, template: str = "professional") -> StreamingResponse:
    session = require_session(session_id)
    content = markdown_to_docx(get_resume_markdown(session), template=template)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="resume-output.docx"'},
    )


@app.get("/sessions/{session_id}/export/json")
def export_json(session_id: str) -> JSONResponse:
    session = require_session(session_id)
    payload = {
        "session_id": session.session_id,
        "status": session.status,
        "brain_dump": session.brain_dump,
        "facts": [fact.model_dump() for fact in session.facts],
        "questions": [question.model_dump() for question in session.questions],
        "answers": session.answers,
        "transcript": session.transcript,
        "resume_draft": session.resume_draft.model_dump() if session.resume_draft else None,
        "review_result": session.review_result.model_dump() if session.review_result else None,
        "final_resume": session.final_resume.model_dump() if session.final_resume else None,
        "expires_at": session.expires_at.isoformat(),
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="resume-output.json"'},
    )


@app.get("/sessions/{session_id}/export/pdf")
def export_pdf(session_id: str, template: str = "professional") -> StreamingResponse:
    session = require_session(session_id)
    content = markdown_to_pdf(get_resume_markdown(session), template=template)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="resume-output.pdf"'},
    )
