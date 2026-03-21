from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Question(BaseModel):
    id: str
    prompt: str


class ResumeFact(BaseModel):
    label: str
    value: str


class ResumeDraft(BaseModel):
    markdown: str


class ReviewResult(BaseModel):
    notes: list[str] = Field(default_factory=list)
    markdown: str


class SessionState(BaseModel):
    session_id: str
    status: Literal[
        "new",
        "intake_complete",
        "questions_ready",
        "resume_ready",
        "review_ready",
        "final_ready",
    ] = "new"
    brain_dump: str = ""
    facts: list[ResumeFact] = Field(default_factory=list)
    questions: list[Question] = Field(default_factory=list)
    answers: dict[str, str] = Field(default_factory=dict)
    resume_draft: ResumeDraft | None = None
    transcript: str = ""
    review_result: ReviewResult | None = None
    final_resume: ResumeDraft | None = None
    expires_at: datetime


class IntakeRequest(BaseModel):
    brain_dump: str


class AnswersRequest(BaseModel):
    answers: dict[str, str]


class RevisionRequest(BaseModel):
    change_request: str
