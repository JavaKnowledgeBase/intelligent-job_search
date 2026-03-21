from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import AnswersRequest, IntakeRequest, RevisionRequest, SessionState
from .services import apply_revision, build_resume, build_transcript, extract_facts, generate_questions, review_resume
from .store import MemorySessionStore

app = FastAPI(title="Resume Co-Pilot API")
store = MemorySessionStore()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_session(session_id: str) -> SessionState:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return session


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/sessions", response_model=SessionState)
def create_session() -> SessionState:
    return store.create()


@app.get("/sessions/{session_id}", response_model=SessionState)
def get_session(session_id: str) -> SessionState:
    return require_session(session_id)


@app.post("/sessions/{session_id}/intake", response_model=SessionState)
def intake(session_id: str, payload: IntakeRequest) -> SessionState:
    session = require_session(session_id)
    session.brain_dump = payload.brain_dump
    session.facts = extract_facts(payload.brain_dump)
    session.status = "intake_complete"
    return store.save(session)


@app.post("/sessions/{session_id}/questions", response_model=SessionState)
def questions(session_id: str) -> SessionState:
    session = require_session(session_id)
    session.questions = generate_questions(session)
    session.status = "questions_ready"
    return store.save(session)


@app.post("/sessions/{session_id}/answers", response_model=SessionState)
def answers(session_id: str, payload: AnswersRequest) -> SessionState:
    session = require_session(session_id)
    session.answers.update(payload.answers)
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
