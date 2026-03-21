import json
import os
from pathlib import Path

from openai import OpenAI
from dotenv import load_dotenv

from .models import Question, ResumeDraft, ResumeFact, ReviewResult, SessionState

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class ResumeAIReviewer:
    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.model = os.getenv("OPENAI_MODEL", "gpt-5-mini")
        self._client = OpenAI(api_key=self.api_key) if self.api_key else None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def review_resume(self, session: SessionState) -> ReviewResult:
        fallback = review_resume_mock(session)
        if self._client is None:
            return fallback

        prompt = "\n\n".join(
            [
                "Transcript:",
                session.transcript or "No transcript available.",
                "Current resume draft:",
                session.resume_draft.markdown if session.resume_draft else "No draft available.",
            ]
        )
        instructions = (
            "You are an expert resume editor. Review the transcript and the draft resume together. "
            "Improve the resume for clarity, ATS readability, credibility, and job relevance. "
            "Return valid JSON with keys 'notes' and 'markdown'. "
            "'notes' must be an array of 2 to 4 short strings describing what you changed. "
            "'markdown' must contain the full improved resume in Markdown."
        )
        payload = self._create_json_response(prompt, instructions)
        if payload is None:
            return fallback

        notes = payload.get("notes")
        markdown = payload.get("markdown")
        if not isinstance(notes, list) or not isinstance(markdown, str):
            return fallback

        clean_notes = [str(note).strip() for note in notes if str(note).strip()]
        if not clean_notes or not markdown.strip():
            return fallback

        return ReviewResult(notes=clean_notes[:4], markdown=markdown.strip())

    def apply_revision(self, session: SessionState, change_request: str) -> ResumeDraft:
        fallback = apply_revision_mock(session, change_request)
        if self._client is None:
            return fallback

        source_markdown = (
            session.review_result.markdown
            if session.review_result is not None
            else session.resume_draft.markdown
            if session.resume_draft is not None
            else "# Candidate Name"
        )
        prompt = "\n\n".join(
            [
                "Transcript:",
                session.transcript or "No transcript available.",
                "Current reviewed resume:",
                source_markdown,
                "Requested changes:",
                change_request.strip() or "No specific change request provided.",
            ]
        )
        instructions = (
            "You are an expert resume editor. Apply the user's requested changes to the reviewed resume "
            "while keeping the output concise, professional, and ATS-friendly. "
            "Return valid JSON with one key: 'markdown'. The value must be the full final resume in Markdown."
        )
        payload = self._create_json_response(prompt, instructions)
        if payload is None:
            return fallback

        markdown = payload.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            return fallback

        return ResumeDraft(markdown=markdown.strip())

    def extract_facts(self, brain_dump: str) -> list[ResumeFact]:
        fallback = extract_facts_mock(brain_dump)
        if self._client is None or not brain_dump.strip():
            return fallback

        instructions = (
            "You are an expert resume strategist. Extract the most useful resume facts from the user's career brain dump. "
            "Return valid JSON with one key: 'facts'. "
            "'facts' must be an array of objects with string keys 'label' and 'value'. "
            "Create 4 to 6 concise, resume-relevant facts."
        )
        payload = self._create_json_response(brain_dump, instructions)
        if payload is None:
            return fallback

        facts = payload.get("facts")
        if not isinstance(facts, list):
            return fallback

        cleaned: list[ResumeFact] = []
        for item in facts:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            value = str(item.get("value", "")).strip()
            if label and value:
                cleaned.append(ResumeFact(label=label, value=value))

        return cleaned or fallback

    def generate_questions(self, session: SessionState) -> list[Question]:
        fallback = generate_questions_mock(session)
        if self._client is None:
            return fallback

        prompt = "\n\n".join(
            [
                "Brain dump:",
                session.brain_dump or "No brain dump provided.",
                "Extracted facts:",
                json.dumps([fact.model_dump() for fact in session.facts]),
            ]
        )
        instructions = (
            "You are an expert resume interviewer. Generate the best follow-up questions needed to improve the resume. "
            "Prioritize measurable impact, tools, scope, leadership, and target role clarity. "
            "Return valid JSON with one key: 'questions'. "
            "'questions' must be an array of 3 to 5 objects with string keys 'id' and 'prompt'. "
            "Each id must be short, lowercase, and underscore-separated."
        )
        payload = self._create_json_response(prompt, instructions)
        if payload is None:
            return fallback

        questions = payload.get("questions")
        if not isinstance(questions, list):
            return fallback

        cleaned: list[Question] = []
        for item in questions:
            if not isinstance(item, dict):
                continue
            question_id = str(item.get("id", "")).strip().lower()
            prompt_text = str(item.get("prompt", "")).strip()
            if question_id and prompt_text:
                cleaned.append(Question(id=question_id, prompt=prompt_text))

        return cleaned or fallback

    def _create_json_response(self, prompt: str, instructions: str) -> dict[str, object] | None:
        if self._client is None:
            return None

        response = self._client.responses.create(
            model=self.model,
            instructions=instructions,
            input=prompt,
        )
        output_text = response.output_text.strip()
        if not output_text:
            return None

        try:
            return json.loads(output_text)
        except json.JSONDecodeError:
            return None


reviewer = ResumeAIReviewer()


def extract_facts_mock(brain_dump: str) -> list[ResumeFact]:
    text = brain_dump.strip()
    if not text:
        return []

    return [
        ResumeFact(label="Target Role", value="Resume still needs a target role"),
        ResumeFact(label="Core Strength", value="Problem solving and coordination"),
        ResumeFact(label="Working Style", value="Reliable, deadline-aware, supportive"),
        ResumeFact(label="Source Summary", value=text[:180]),
    ]


def generate_questions_mock(session: SessionState) -> list[Question]:
    return [
        Question(
            id="impact",
            prompt="What result or measurable impact are you most proud of in a recent role?",
        ),
        Question(
            id="tools",
            prompt="Which software, tools, or platforms do you use confidently?",
        ),
        Question(
            id="target",
            prompt="What type of job title are you targeting with this resume?",
        ),
    ]


def build_resume(session: SessionState) -> ResumeDraft:
    impact = session.answers.get("impact", "Delivered reliable results across daily operations.")
    tools = session.answers.get("tools", "General workplace and collaboration tools")
    target = session.answers.get("target", "Operations or support-focused roles")

    markdown = "\n".join(
        [
            "# Candidate Name",
            "",
            "## Summary",
            (
                f"Adaptable professional targeting {target}. Brings strong coordination, "
                "communication, and follow-through with a practical approach to problem solving."
            ),
            "",
            "## Experience Highlights",
            f"- {impact}",
            "- Kept work organized, visible, and moving under deadlines.",
            "- Supported teams and stakeholders with clear communication.",
            "",
            "## Skills",
            f"- {tools}",
            "- Process coordination",
            "- Documentation",
            "- Customer and stakeholder support",
        ]
    )
    return ResumeDraft(markdown=markdown)


def build_transcript(session: SessionState) -> str:
    lines = [
        "# Session Transcript",
        "",
        "## Brain Dump",
        session.brain_dump or "No brain dump provided.",
        "",
        "## Follow-Up Answers",
    ]

    if session.answers:
        for question in session.questions:
            answer = session.answers.get(question.id, "No answer provided.")
            lines.extend(
                [
                    f"### {question.prompt}",
                    answer,
                    "",
                ]
            )
    else:
        lines.append("No follow-up answers provided.")

    return "\n".join(lines).strip()


def review_resume_mock(session: SessionState) -> ReviewResult:
    base_markdown = (
        session.resume_draft.markdown
        if session.resume_draft is not None
        else "# Candidate Name\n\n## Summary\nDraft unavailable."
    )
    target = session.answers.get("target", "operations or support-focused roles")
    reviewed = base_markdown.replace(
        "## Summary",
        "## Summary\nTailored after reviewing the conversation transcript for clarity, relevance, and job-fit.",
        1,
    )
    notes = [
        "Summary tightened to sound more role-targeted.",
        f"Language tuned toward {target}.",
        "Kept the draft concise and ATS-friendly.",
    ]
    return ReviewResult(notes=notes, markdown=reviewed)


def apply_revision_mock(session: SessionState, change_request: str) -> ResumeDraft:
    source = (
        session.review_result.markdown
        if session.review_result is not None
        else session.resume_draft.markdown
        if session.resume_draft is not None
        else "# Candidate Name"
    )
    revised = "\n".join(
        [
            source,
            "",
            "## Requested Changes Applied",
            change_request.strip() or "No specific change request provided.",
        ]
    )
    return ResumeDraft(markdown=revised)


def review_resume(session: SessionState) -> ReviewResult:
    return reviewer.review_resume(session)


def apply_revision(session: SessionState, change_request: str) -> ResumeDraft:
    return reviewer.apply_revision(session, change_request)


def extract_facts(brain_dump: str) -> list[ResumeFact]:
    return reviewer.extract_facts(brain_dump)


def generate_questions(session: SessionState) -> list[Question]:
    return reviewer.generate_questions(session)
