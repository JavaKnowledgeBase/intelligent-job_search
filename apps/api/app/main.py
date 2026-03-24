from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse

from .exporters import markdown_to_docx, markdown_to_pdf
from .models import (
    AudioTranscriptionResponse,
    AnswersRequest,
    FactsRequest,
    IntakeRequest,
    RealtimeTokenResponse,
    ResumeDraft,
    ResumeDraftUpdateRequest,
    RevisionRequest,
    SessionState,
    UploadExtractResponse,
)
from .services import (
    apply_revision,
    build_resume,
    build_transcript,
    create_realtime_transcription_token,
    extract_facts,
    generate_questions,
    review_resume,
    transcribe_audio,
)
from .safety import (
    collect_session_moderation_notes,
    sanitize_answer_map,
    sanitize_facts,
    sanitize_markdown_output,
    sanitize_user_text,
    validate_audio_upload,
)
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
        return sanitize_markdown_output(session.final_resume.markdown)
    if session.review_result is not None:
        return sanitize_markdown_output(session.review_result.markdown)
    if session.resume_draft is not None:
        return sanitize_markdown_output(session.resume_draft.markdown)
    raise HTTPException(status_code=400, detail="No resume is ready to export yet")


def clear_generated_outputs(session: SessionState) -> None:
    session.resume_draft = None
    session.transcript = ""
    session.review_result = None
    session.final_resume = None


def refresh_moderation_notes(
    session: SessionState,
    *,
    brain_dump_source: str | None = None,
    answer_source: dict[str, str] | None = None,
) -> None:
    source_brain_dump = session.brain_dump if brain_dump_source is None else brain_dump_source
    source_answers = session.answers if answer_source is None else answer_source
    session.moderation_notes = collect_session_moderation_notes(source_brain_dump, source_answers)


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


@app.post("/audio/transcribe", response_model=AudioTranscriptionResponse)
async def transcribe_audio_upload(file: UploadFile = File(...)) -> AudioTranscriptionResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="A filename is required")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded audio is empty")
    try:
        validate_audio_upload(file.filename, content)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    transcript = transcribe_audio(file.filename, content)
    if not transcript:
        raise HTTPException(
            status_code=503,
            detail="Audio transcription is unavailable right now. Check your OpenAI configuration and try again.",
        )

    return AudioTranscriptionResponse(text=transcript)


@app.post("/audio/realtime-token", response_model=RealtimeTokenResponse)
def create_audio_realtime_token() -> RealtimeTokenResponse:
    token = create_realtime_transcription_token()
    if token is None:
      raise HTTPException(
          status_code=503,
          detail="Realtime transcription is unavailable right now. Check your OpenAI configuration and try again.",
      )

    return RealtimeTokenResponse(value=str(token["value"]), expires_at=int(token["expires_at"]))


@app.get("/sessions/{session_id}", response_model=SessionState)
def get_session(session_id: str) -> SessionState:
    return require_session(session_id)


@app.post("/sessions/{session_id}/intake", response_model=SessionState)
def intake(session_id: str, payload: IntakeRequest) -> SessionState:
    session = require_session(session_id)
    safe_brain_dump = sanitize_user_text(payload.brain_dump)
    session.brain_dump = safe_brain_dump
    session.facts = extract_facts(safe_brain_dump)
    refresh_moderation_notes(session, brain_dump_source=payload.brain_dump, answer_source=session.answers)
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
    session.facts = sanitize_facts(payload.facts)
    refresh_moderation_notes(session)
    clear_generated_outputs(session)
    if session.questions:
        session.status = "questions_ready"
    else:
        session.status = "intake_complete"
    return store.save(session)


@app.post("/sessions/{session_id}/answers", response_model=SessionState)
def answers(session_id: str, payload: AnswersRequest) -> SessionState:
    session = require_session(session_id)
    sanitized_answers = sanitize_answer_map(payload.answers)
    raw_answer_source = {**session.answers, **{str(key): str(value) for key, value in payload.answers.items()}}
    session.answers.update(sanitized_answers)
    refresh_moderation_notes(session, answer_source=raw_answer_source)
    session.resume_draft = None
    session.transcript = ""
    session.review_result = None
    session.final_resume = None
    return store.save(session)


@app.post("/sessions/{session_id}/resume", response_model=SessionState)
def resume(session_id: str) -> SessionState:
    session = require_session(session_id)
    session.resume_draft = ResumeDraft(markdown=sanitize_markdown_output(build_resume(session).markdown))
    session.transcript = build_transcript(session)
    session.status = "resume_ready"
    return store.save(session)


@app.post("/sessions/{session_id}/resume-draft", response_model=SessionState)
def update_resume_draft(session_id: str, payload: ResumeDraftUpdateRequest) -> SessionState:
    session = require_session(session_id)
    session.resume_draft = ResumeDraft(
        markdown=sanitize_markdown_output(payload.markdown.strip() or "# Resume Draft")
    )
    session.review_result = None
    session.final_resume = None
    session.status = "resume_ready"
    return store.save(session)


@app.post("/sessions/{session_id}/review", response_model=SessionState)
def review(session_id: str) -> SessionState:
    session = require_session(session_id)
    result = review_resume(session)
    session.review_result = result.model_copy(
        update={"markdown": sanitize_markdown_output(result.markdown)}
    )
    session.status = "review_ready"
    return store.save(session)


@app.post("/sessions/{session_id}/finalize", response_model=SessionState)
def finalize(session_id: str, payload: RevisionRequest) -> SessionState:
    session = require_session(session_id)
    result = apply_revision(session, sanitize_user_text(payload.change_request))
    session.final_resume = ResumeDraft(markdown=sanitize_markdown_output(result.markdown))
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
