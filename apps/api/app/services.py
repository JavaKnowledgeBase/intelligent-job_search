import json
import os
import re
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

    def build_resume(self, session: SessionState) -> ResumeDraft:
        fallback = build_resume_mock(session)
        if self._client is None:
            return fallback

        facts_json = json.dumps([fact.model_dump() for fact in session.facts], ensure_ascii=True)
        answers_json = json.dumps(session.answers, ensure_ascii=True)
        prompt = "\n\n".join(
            [
                "Brain dump:",
                session.brain_dump or "No brain dump provided.",
                "Extracted facts:",
                facts_json,
                "Follow-up questions:",
                json.dumps([question.model_dump() for question in session.questions], ensure_ascii=True),
                "Answers:",
                answers_json or "{}",
            ]
        )
        instructions = (
            "You are an expert resume writer creating a strong first draft from messy source material. "
            "Return valid JSON with one key: 'markdown'. "
            "The value must be the full resume in Markdown. "
            "Use a confident, ATS-friendly structure with sections for Summary, Core Skills, Professional Experience, and Education or Additional Information when appropriate. "
            "Do not invent employers, dates, degrees, or certifications. "
            "If exact details are missing, write honest but useful bullets based only on the provided information."
        )
        payload = self._create_json_response(prompt, instructions)
        if payload is None:
            return fallback

        markdown = payload.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            return fallback

        return ResumeDraft(markdown=markdown.strip())

    def _create_json_response(self, prompt: str, instructions: str) -> dict[str, object] | None:
        if self._client is None:
            return None

        try:
            response = self._client.responses.create(
                model=self.model,
                instructions=instructions,
                input=prompt,
            )
        except Exception:
            # Fall back to local mocks when the OpenAI API is unreachable.
            return None

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
    return reviewer.build_resume(session)


def build_resume_mock(session: SessionState) -> ResumeDraft:
    impact = _clean_sentence(
        session.answers.get("impact", "Delivered reliable results across daily operations.")
    )
    target = _clean_sentence(
        session.answers.get("target", _guess_target_role(session.brain_dump, session.facts))
    )
    tools_text = session.answers.get("tools", "")
    skills = _collect_skill_items(session, tools_text)
    fact_lines = [fact.value.strip() for fact in session.facts if fact.value.strip()]
    highlight_lines = _build_experience_highlights(session, impact, fact_lines)
    experience_title = _guess_experience_heading(session.brain_dump)
    summary = _build_summary(session, target, skills, fact_lines)
    additional_details = _build_additional_details(session, target, skills)
    extra_answers = [
        _clean_sentence(value)
        for key, value in session.answers.items()
        if key not in {"impact", "tools", "target"} and value.strip()
    ]

    markdown = "\n".join(
        [
            "# Candidate Name",
            "",
            "## Summary",
            summary,
            "",
            "## Core Skills",
            *[f"- {skill}" for skill in skills],
            "",
            "## Professional Experience",
            f"### {experience_title}",
            *[f"- {line}" for line in highlight_lines],
            "",
            "## Additional Information",
            *[f"- {line}" for line in additional_details],
        ]
    )

    if extra_answers:
        markdown += "\n" + "\n".join(f"- {answer}" for answer in extra_answers[:3])

    return ResumeDraft(markdown=markdown)


def build_transcript(session: SessionState) -> str:
    lines = [
        "# Session Transcript",
        "",
        "## Brain Dump",
        session.brain_dump or "No brain dump provided.",
        "",
        "## Extracted Facts",
    ]

    if session.facts:
        for fact in session.facts:
            lines.append(f"- {fact.label}: {fact.value}")
    else:
        lines.append("No extracted facts available.")

    lines.extend(
        [
            "",
        "## Follow-Up Answers",
        ]
    )

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


def _clean_sentence(value: str) -> str:
    cleaned = " ".join(value.strip().split())
    if not cleaned:
        return ""
    cleaned = cleaned.rstrip(" .!?")
    return f"{cleaned}."


def _guess_target_role(brain_dump: str, facts: list[ResumeFact]) -> str:
    combined = " ".join([brain_dump, *[fact.value for fact in facts]]).lower()
    role_keywords = [
        "operations coordinator",
        "customer support specialist",
        "project coordinator",
        "administrative coordinator",
        "office manager",
        "operations specialist",
        "customer success specialist",
    ]
    for keyword in role_keywords:
        if keyword in combined:
            return keyword.title()

    if "operations" in combined and "support" in combined:
        return "Operations and Support Roles"
    if "operations" in combined:
        return "Operations Roles"
    if "support" in combined or "customer" in combined:
        return "Customer Support Roles"
    if "project" in combined or "coordination" in combined:
        return "Project Coordination Roles"
    return "Operations or support-focused roles"


def _split_items(text: str) -> list[str]:
    normalized = text.replace("\n", ",")
    parts = re.split(r",|/|\||;| and ", normalized)
    cleaned: list[str] = []
    seen: set[str] = set()

    for part in parts:
        item = " ".join(part.strip().split())
        if len(item) < 2:
            continue
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        cleaned.append(item)

    return cleaned


def _collect_skill_items(session: SessionState, tools_text: str) -> list[str]:
    items: list[str] = []
    seen: set[str] = set()

    def add(item: str) -> None:
        cleaned = " ".join(item.strip().split())
        if not cleaned:
            return
        lowered = cleaned.lower()
        canonical = {
            "crm": "crm systems",
            "crm tool": "crm systems",
            "crm tools": "crm systems",
            "ticketing": "ticketing systems",
        }.get(lowered, lowered)
        if canonical in seen:
            return
        if lowered in seen:
            return
        seen.add(canonical)
        items.append(cleaned)

    for item in _split_items(tools_text):
        add(item)

    combined = " ".join([session.brain_dump, *[fact.value for fact in session.facts]])
    keyword_map = [
        ("excel", "Excel"),
        ("crm", "CRM systems"),
        ("ticket", "Ticketing systems"),
        ("customer", "Customer communication"),
        ("support", "Support operations"),
        ("coordination", "Cross-functional coordination"),
        ("documentation", "Documentation"),
        ("workflow", "Workflow improvement"),
        ("scheduling", "Scheduling"),
        ("operations", "Operations support"),
    ]

    lowered = combined.lower()
    for needle, label in keyword_map:
        if needle in lowered:
            add(label)

    defaults = [
        "Process coordination",
        "Documentation and workflow support",
        "Stakeholder communication",
    ]
    for item in defaults:
        if len(items) >= 6:
            break
        add(item)

    return items[:6]


def _build_summary(session: SessionState, target: str, skills: list[str], fact_lines: list[str]) -> str:
    strength = fact_lines[0] if fact_lines else "Dependable support across fast-moving team environments."
    lead_skill = skills[0] if skills else "cross-functional coordination"
    target_text = target.rstrip(".")
    return (
        f"Adaptable professional targeting {target_text}. Brings strength in {lead_skill}, "
        f"clear communication, and practical problem solving. Known for {strength.rstrip('.').lower()}."
    )


def _build_experience_highlights(
    session: SessionState, impact: str, fact_lines: list[str]
) -> list[str]:
    highlights: list[str] = [impact]

    for fact in fact_lines:
        if len(_split_items(fact)) >= 3 and len(fact.split()) <= 8:
            continue
        cleaned = _clean_sentence(fact)
        if cleaned and cleaned.lower() not in {item.lower() for item in highlights}:
            highlights.append(cleaned)
        if len(highlights) >= 4:
            break

    sentence_candidates = _extract_brain_dump_sentences(session.brain_dump)
    for sentence in sentence_candidates:
        if sentence.lower() not in {item.lower() for item in highlights}:
            highlights.append(sentence)
        if len(highlights) >= 5:
            break

    defaults = [
        "Kept work organized, visible, and moving under deadlines.",
        "Supported teams and stakeholders with timely, clear updates.",
    ]
    for item in defaults:
        if len(highlights) >= 5:
            break
        if item.lower() not in {line.lower() for line in highlights}:
            highlights.append(item)

    return highlights[:5]


def _extract_brain_dump_sentences(brain_dump: str) -> list[str]:
    raw_sentences = re.split(r"(?<=[.!?])\s+", brain_dump.strip())
    cleaned: list[str] = []

    for sentence in raw_sentences:
        candidate = _clean_sentence(sentence)
        if not candidate:
            continue
        if len(candidate.split()) < 5:
            continue
        cleaned.append(candidate)

    return cleaned


def _guess_experience_heading(brain_dump: str) -> str:
    lowered = brain_dump.lower()
    if "customer" in lowered or "support" in lowered:
        return "Support and Operations Experience"
    if "project" in lowered or "coordinate" in lowered:
        return "Project and Coordination Experience"
    return "Experience Highlights"


def _build_additional_details(
    session: SessionState, target: str, skills: list[str]
) -> list[str]:
    details = [f"Target role: {target}"]
    if skills:
        details.append(f"Key tools and strengths: {', '.join(skills[:4])}")

    if session.facts:
        labeled_fact = session.facts[0]
        details.append(f"{labeled_fact.label}: {labeled_fact.value}")

    return details[:3]
