import json
import os
import re
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

from openai import OpenAI
from dotenv import load_dotenv

from .models import Question, ResumeDraft, ResumeFact, ReviewResult, SessionState
from .safety import sanitize_answer_map, sanitize_facts, sanitize_markdown_output, sanitize_user_text

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
                sanitize_user_text(session.transcript or "No transcript available."),
                "Current resume draft:",
                sanitize_user_text(
                    session.resume_draft.markdown if session.resume_draft else "No draft available."
                ),
            ]
        )
        instructions = (
            "You are a senior resume editor and career coach with expertise across every profession. "
            "Review the transcript (source material) and the draft resume together, then produce a significantly improved version. "
            "Return valid JSON with keys 'notes' and 'markdown'. "
            "'notes' must be an array of 3 to 4 short strings describing the specific improvements made. "
            "'markdown' must contain the full improved resume in Markdown. "
            "\n\nIMPROVEMENT PRIORITIES:\n"
            "1. COMPLETENESS — Cross-check the transcript against the draft. If any role, achievement, skill, or detail from the "
            "transcript is missing or under-represented in the draft, add it now. The draft must reflect everything the candidate provided.\n"
            "2. IMPACT — Strengthen every bullet with action verbs and outcomes. Add scope, scale, and measurable results "
            "wherever the source material supports it. Convert passive descriptions into active accomplishments.\n"
            "3. PROFESSION FIT — Ensure terminology, section names, and conventions match the candidate's field. "
            "Technical resumes should show technical depth. Healthcare resumes should reflect clinical language. Trade resumes should show certifications and safety record.\n"
            "4. ATS QUALITY — Ensure keywords from the source material are present and naturally integrated. "
            "Use clean heading hierarchy. Remove decorative formatting that ATS systems cannot parse.\n"
            "5. CREDIBILITY — Every claim must be traceable to the source material. Do not invent or exaggerate."
        )
        payload = self._create_json_response(prompt, instructions)
        if payload is None:
            return fallback

        notes = payload.get("notes")
        markdown = payload.get("markdown")
        if not isinstance(notes, list) or not isinstance(markdown, str):
            return fallback

        clean_notes = [sanitize_user_text(str(note), max_length=160) for note in notes if str(note).strip()]
        if not clean_notes or not markdown.strip():
            return fallback

        return ReviewResult(notes=clean_notes[:4], markdown=sanitize_markdown_output(markdown.strip()))

    def apply_revision(self, session: SessionState, change_request: str) -> ResumeDraft:
        safe_change_request = sanitize_user_text(change_request)
        fallback = apply_revision_mock(session, safe_change_request)
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
                sanitize_user_text(session.transcript or "No transcript available."),
                "Current reviewed resume:",
                sanitize_user_text(source_markdown),
                "Requested changes:",
                safe_change_request or "No specific change request provided.",
            ]
        )
        instructions = (
            "You are an expert resume editor. Apply the user's requested changes to the reviewed resume "
            "while keeping the output professional, ATS-friendly, and faithful to the candidate's source material. "
            "Do not remove substantive input unless the user explicitly asks to delete it. "
            "Prefer enhancing and modernizing existing bullets over shortening them. "
            "Return valid JSON with one key: 'markdown'. The value must be the full final resume in Markdown."
        )
        payload = self._create_json_response(prompt, instructions)
        if payload is None:
            return fallback

        markdown = payload.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            return fallback

        return ResumeDraft(markdown=sanitize_markdown_output(markdown.strip()))

    def extract_facts(self, brain_dump: str) -> list[ResumeFact]:
        safe_brain_dump = sanitize_user_text(brain_dump)
        fallback = extract_facts_mock(safe_brain_dump)
        if self._client is None or not safe_brain_dump.strip():
            return fallback

        instructions = (
            "You are an expert career strategist working with candidates from every profession imaginable — "
            "engineering, healthcare, law, finance, trades, arts, education, hospitality, technology, and more. "
            "Extract the most resume-relevant facts from the provided career material, regardless of field or seniority level. "
            "Return valid JSON with one key: 'facts'. "
            "'facts' must be an array of 6 to 10 objects with string keys 'label' and 'value'. "
            "Cover: target role or career direction, years of experience, industries or sectors worked in, "
            "key tools or technologies or equipment used, strongest skills or competencies, "
            "notable accomplishments or outcomes, certifications or qualifications if mentioned, "
            "education level if mentioned, any leadership or team scope, and work style or approach. "
            "Adapt labels to the candidate's profession — do not force corporate terminology on non-corporate roles. "
            "Be specific: extract real values from the text, not generic placeholders."
        )
        payload = self._create_json_response(safe_brain_dump, instructions)
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

        return sanitize_facts(cleaned or fallback)

    def generate_questions(self, session: SessionState) -> list[Question]:
        fallback = generate_questions_mock(session)
        if self._client is None:
            return fallback

        prompt = "\n\n".join(
            [
                "Brain dump:",
                sanitize_user_text(session.brain_dump or "No brain dump provided."),
                "Extracted facts:",
                json.dumps([fact.model_dump() for fact in sanitize_facts(session.facts)]),
            ]
        )
        instructions = (
            "You are an expert career interviewer who works with candidates from every profession — "
            "from software engineers and nurses to electricians, teachers, chefs, lawyers, and artists. "
            "Your job is to ask follow-up questions that fill the most important gaps in the candidate's resume material. "
            "Study the brain dump and extracted facts carefully, then generate targeted questions relevant to THEIR specific profession and career level. "
            "Return valid JSON with one key: 'questions'. "
            "'questions' must be an array of exactly 4 objects with string keys 'id' and 'prompt'. "
            "Each id must be short, lowercase, and underscore-separated (e.g. 'biggest_win', 'tools_used'). "
            "Focus on: the single most impressive achievement or result they are proud of (with numbers or scale if possible), "
            "the main tools, software, equipment, or methods they use daily, "
            "the scope of their most recent role (team size, budget, volume, responsibility area), "
            "and what type of role or employer they are targeting next. "
            "Write each question in plain, conversational language — not corporate jargon. "
            "Adapt the framing to the profession: a nurse's 'scope' is different from a software engineer's."
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

        facts_json = json.dumps([fact.model_dump() for fact in sanitize_facts(session.facts)], ensure_ascii=True)
        answers_json = json.dumps(sanitize_answer_map(session.answers), ensure_ascii=True)
        prompt = "\n\n".join(
            [
                "Brain dump:",
                sanitize_user_text(session.brain_dump or "No brain dump provided."),
                "Extracted facts:",
                facts_json,
                "Follow-up questions:",
                json.dumps([question.model_dump() for question in session.questions], ensure_ascii=True),
                "Answers:",
                answers_json or "{}",
            ]
        )
        instructions = (
            "You are a world-class resume writer who specialises in every profession — technology, healthcare, education, trades, "
            "law, finance, hospitality, arts, government, non-profit, and beyond. "
            "Your task is to transform the provided career material into a polished, complete, professional resume. "
            "Return valid JSON with one key: 'markdown'. The value must be the full resume in Markdown. "
            "\n\nCRITICAL RULES:\n"
            "1. USE EVERY PIECE OF INPUT. Every role, tool, achievement, skill, and detail the candidate mentioned must appear. "
            "Nothing gets dropped. If they said it, it belongs in the resume.\n"
            "2. ENHANCE, NEVER INVENT. Rewrite rough notes into polished bullets with strong action verbs. "
            "Add professional polish but never fabricate employers, dates, credentials, or achievements not present in the source.\n"
            "3. BE PROFESSION-APPROPRIATE. Adapt the tone, terminology, and structure to fit the candidate's field. "
            "A nurse's resume looks different from a software engineer's. Match the conventions of their profession.\n"
            "4. DEPTH OVER BREVITY. Do not summarise away valuable experience. If the source describes multiple roles or responsibilities, "
            "give each proper bullet coverage. A senior professional's resume should be substantial.\n"
            "5. ATS-OPTIMISED. Use clear section headings, consistent formatting, and industry-relevant keywords from the provided material.\n"
            "\nSTRUCTURE GUIDANCE (adapt to profession):\n"
            "- Use a Professional Summary that captures the candidate's identity, experience level, and value proposition.\n"
            "- Include a Skills or Core Competencies section with specific tools, technologies, methods, and certifications.\n"
            "- For each role in Professional Experience: provide employer name (if given), title, dates (if given), "
            "and 3-6 strong achievement-oriented bullets covering scope, tools, and outcomes.\n"
            "- Add Education, Certifications, or Licenses if mentioned.\n"
            "- Add any other sections that are standard for their profession (e.g. Publications, Projects, Clinical Experience, Portfolio).\n"
            "- If the candidate's field does not use a traditional resume format, adapt accordingly."
        )
        payload = self._create_json_response(prompt, instructions)
        if payload is None:
            return fallback

        markdown = payload.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            return fallback

        return ResumeDraft(markdown=sanitize_markdown_output(markdown.strip()))

    def transcribe_audio(self, filename: str, content: bytes) -> str | None:
        if self._client is None or not content:
            return None

        audio_file = BytesIO(content)
        audio_file.name = filename

        try:
            response = self._client.audio.transcriptions.create(
                model=os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"),
                file=audio_file,
            )
        except Exception:
            return None

        text = getattr(response, "text", "")
        cleaned = sanitize_user_text(text)
        return cleaned or None

    def create_realtime_transcription_token(self) -> dict[str, object] | None:
        if not self.api_key:
            return None

        payload = {
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "format": {
                            "type": "audio/pcm",
                            "rate": 24000,
                        },
                        "transcription": {
                            "model": os.getenv(
                                "OPENAI_LIVE_TRANSCRIPTION_MODEL",
                                "gpt-4o-mini-transcribe",
                            ),
                            "language": "en",
                        },
                        "turn_detection": {
                            "type": "server_vad",
                            "silence_duration_ms": 500,
                        },
                    },
                },
                "include": [],
            }
        }
        request = urllib_request.Request(
            "https://api.openai.com/v1/realtime/client_secrets",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib_request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
        except (urllib_error.URLError, urllib_error.HTTPError, TimeoutError, json.JSONDecodeError):
            return None

        value = str(data.get("value", "")).strip()
        expires_at = int(data.get("expires_at", 0) or 0)

        if not value or not expires_at:
            return None

        return {"value": value, "expires_at": expires_at}

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


class ClaudeResumeBuilder:
    def __init__(self) -> None:
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        self.model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        self._client = None
        if self.api_key:
            try:
                import anthropic as _anthropic
                self._client = _anthropic.Anthropic(api_key=self.api_key)
            except ImportError:
                pass

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def build_resume(self, session: SessionState) -> ResumeDraft:
        fallback = build_resume_mock(session)
        if self._client is None:
            return fallback

        facts_json = json.dumps([fact.model_dump() for fact in sanitize_facts(session.facts)], ensure_ascii=True)
        answers_json = json.dumps(sanitize_answer_map(session.answers), ensure_ascii=True)
        user_content = "\n\n".join([
            "Brain dump:",
            sanitize_user_text(session.brain_dump or "No brain dump provided."),
            "Extracted facts:",
            facts_json,
            "Follow-up questions:",
            json.dumps([q.model_dump() for q in session.questions], ensure_ascii=True),
            "Answers:",
            answers_json or "{}",
        ])
        system_prompt = (
            "You are a world-class resume writer with deep expertise across every profession — "
            "technology, healthcare, law, finance, education, trades, arts, hospitality, government, and beyond. "
            "Transform the provided career material into the most compelling, complete, and professional resume possible. "
            "\n\nCRITICAL RULES:\n"
            "1. INCLUDE EVERYTHING. Every role, achievement, skill, tool, and detail the candidate mentioned must appear in the resume. "
            "Nothing gets omitted. If they mentioned it, it has a place.\n"
            "2. ENHANCE, NEVER FABRICATE. Polish rough notes into powerful bullets with strong action verbs and outcomes. "
            "Never invent employers, dates, credentials, or achievements not present in the source.\n"
            "3. PROFESSION-APPROPRIATE. Adapt tone, structure, terminology, and depth to suit the candidate's specific field. "
            "Their resume should look like it was written by someone who knows their industry intimately.\n"
            "4. FULL DEPTH. Senior and experienced candidates deserve a detailed resume. Do not compress years of experience into vague summaries.\n"
            "5. ATS-OPTIMISED. Use clean section headings, strong keywords from the source material, and professional formatting.\n"
            "\nReturn ONLY the complete resume in Markdown. No preamble, no commentary, no explanations."
        )

        try:
            response = self._client.messages.create(
                model=self.model,
                max_tokens=4000,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}],
            )
            markdown = response.content[0].text.strip()
            if not markdown:
                return fallback
            return ResumeDraft(markdown=sanitize_markdown_output(markdown))
        except Exception:
            return fallback


claude_builder = ClaudeResumeBuilder()


@dataclass
class ParsedResumeRole:
    employer: str
    title_line: str = ""
    bullets: list[str] = field(default_factory=list)


def extract_facts_mock(brain_dump: str) -> list[ResumeFact]:
    text = sanitize_user_text(brain_dump)
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


def claude_build_resume(session: SessionState) -> ResumeDraft:
    return claude_builder.build_resume(session)


def transcribe_audio(filename: str, content: bytes) -> str | None:
    return reviewer.transcribe_audio(filename, content)


def create_realtime_transcription_token() -> dict[str, object] | None:
    return reviewer.create_realtime_transcription_token()


def build_resume_mock(session: SessionState) -> ResumeDraft:
    parsed_resume = _parse_uploaded_resume(session.brain_dump)
    if parsed_resume is not None:
        return _build_resume_from_existing_resume(session, parsed_resume)

    impact = _clean_sentence(
        session.answers.get("impact", "Delivered reliable results across daily operations.")
    )
    target = _clean_sentence(
        session.answers.get("target", _guess_target_role(session.brain_dump, session.facts))
    )
    tools_text = session.answers.get("tools", "")
    skills = _collect_skill_items(session, tools_text)
    fact_lines = _meaningful_fact_lines(session.facts)
    highlight_lines = _build_experience_highlights(session, impact, fact_lines)
    experience_title = _guess_experience_heading(session.brain_dump)
    summary = _build_summary(session, target, skills, fact_lines)
    additional_details = _build_additional_details(session, target, skills)
    safe_answers = sanitize_answer_map(session.answers)
    extra_answers = [
        _clean_sentence(value)
        for key, value in safe_answers.items()
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

    return ResumeDraft(markdown=sanitize_markdown_output(markdown))


def _build_resume_from_existing_resume(
    session: SessionState, parsed_resume: dict[str, object]
) -> ResumeDraft:
    candidate_name = str(parsed_resume.get("name") or "Candidate Name").strip()
    summary_lines = [line for line in parsed_resume.get("summary_lines", []) if str(line).strip()]
    skill_lines = [line for line in parsed_resume.get("skill_lines", []) if str(line).strip()]
    roles = [role for role in parsed_resume.get("roles", []) if isinstance(role, ParsedResumeRole)]
    target = _clean_sentence(
        session.answers.get("target", _guess_target_role(session.brain_dump, session.facts))
    )

    summary = (
        " ".join(summary_lines[:3])
        if summary_lines
        else _build_summary(session, target, _collect_skill_items(session, ""), _meaningful_fact_lines(session.facts))
    )
    summary = _modernize_summary(summary)

    core_skills = _normalize_skill_lines(skill_lines) or _collect_skill_items(session, session.answers.get("tools", ""))

    experience_lines: list[str] = []
    for role in roles:
        experience_lines.append(f"### {role.employer}")
        if role.title_line:
            experience_lines.append(_format_role_metadata_line(role.title_line))
        for bullet in _enhance_role_bullets(role.bullets):
            experience_lines.append(f"- {bullet}")
        experience_lines.append("")

    if not experience_lines:
        fallback_lines = _build_experience_highlights(
            session,
            _clean_sentence(session.answers.get("impact", "Delivered reliable results across daily operations.")),
            _meaningful_fact_lines(session.facts),
        )
        experience_lines.extend([f"- {line}" for line in fallback_lines])
    elif experience_lines[-1] == "":
        experience_lines.pop()

    markdown = "\n".join(
        [
            f"# {candidate_name}",
            "",
            "## Summary",
            summary,
            "",
            "## Core Skills",
            *[f"- {skill}" for skill in core_skills[:12]],
            "",
            "## Professional Experience",
            *experience_lines,
            "",
            "## Additional Information",
            *[f"- {line}" for line in _build_existing_resume_additional_details(parsed_resume)],
        ]
    )

    return ResumeDraft(markdown=sanitize_markdown_output(markdown))


def build_transcript(session: SessionState) -> str:
    safe_brain_dump = sanitize_user_text(session.brain_dump)
    safe_facts = sanitize_facts(session.facts)
    safe_answers = sanitize_answer_map(session.answers)
    lines = [
        "# Session Transcript",
        "",
        "## Brain Dump",
        safe_brain_dump or "No brain dump provided.",
        "",
        "## Extracted Facts",
    ]

    if safe_facts:
        for fact in safe_facts:
            lines.append(f"- {fact.label}: {fact.value}")
    else:
        lines.append("No extracted facts available.")

    lines.extend(
        [
            "",
        "## Follow-Up Answers",
        ]
    )

    if safe_answers:
        for question in session.questions:
            answer = safe_answers.get(question.id, "No answer provided.")
            lines.extend(
                [
                    f"### {question.prompt}",
                    answer,
                    "",
                ]
            )
    else:
        lines.append("No follow-up answers provided.")

    return sanitize_user_text("\n".join(lines).strip())


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
    return ReviewResult(
        notes=[sanitize_user_text(note, max_length=160) for note in notes],
        markdown=sanitize_markdown_output(reviewed),
    )


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
            sanitize_user_text(change_request.strip() or "No specific change request provided."),
        ]
    )
    return ResumeDraft(markdown=sanitize_markdown_output(revised))


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
    years_text = _extract_years_of_experience(session.brain_dump)
    opening = (
        f"Professional with {years_text} of experience targeting {target_text}."
        if years_text
        else f"Adaptable professional targeting {target_text}."
    )
    return (
        f"{opening} Brings strength in {lead_skill}, clear communication, and practical problem solving. "
        f"Known for {strength.rstrip('.').lower()}."
    )


def _meaningful_fact_lines(facts: list[ResumeFact]) -> list[str]:
    placeholders = {
        "resume still needs a target role",
        "problem solving and coordination",
        "reliable, deadline-aware, supportive",
    }
    cleaned: list[str] = []
    for fact in facts:
        value = " ".join(fact.value.strip().split())
        if not value:
            continue
        if value.lower() in placeholders:
            continue
        if fact.label.strip().lower() == "source summary":
            continue
        cleaned.append(value)

    return cleaned


def _build_experience_highlights(
    session: SessionState, impact: str, fact_lines: list[str]
) -> list[str]:
    source_lines = _collect_experience_source_lines(session, impact, fact_lines)
    highlights: list[str] = []
    seen: set[str] = set()

    for source in source_lines:
        enhanced = _enhance_experience_line(source)
        normalized = enhanced.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        highlights.append(enhanced)
        if len(highlights) >= 8:
            break

    defaults = [
        "Maintained organized workflows, clear documentation, and consistent follow-through across daily responsibilities.",
        "Provided timely updates to stakeholders and partnered with teams to keep work moving smoothly.",
    ]
    for item in defaults:
        normalized = item.lower()
        if len(highlights) >= 8:
            break
        if normalized in seen:
            continue
        seen.add(normalized)
        highlights.append(item)

    return highlights[:8]


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


def _parse_uploaded_resume(brain_dump: str) -> dict[str, object] | None:
    lines = [line.strip() for line in brain_dump.splitlines() if line.strip()]
    if len(lines) < 6:
        return None

    headings = {
        "PROFESSIONAL SUMMARY",
        "CORE COMPETENCIES",
        "TECHNICAL SKILLS",
        "PROFESSIONAL EXPERIENCE",
        "EDUCATION",
    }
    if sum(1 for line in lines if line.upper() in headings) < 2:
        return None

    sections: dict[str, list[str]] = {}
    current_section = "HEADER"
    sections[current_section] = []
    for line in lines:
        upper = line.upper()
        if upper in headings:
            current_section = upper
            sections.setdefault(current_section, [])
            continue
        sections.setdefault(current_section, []).append(line)

    return {
        "name": sections.get("HEADER", ["Candidate Name"])[0] if sections.get("HEADER") else "Candidate Name",
        "summary_lines": sections.get("PROFESSIONAL SUMMARY", []),
        "skill_lines": [
            *sections.get("CORE COMPETENCIES", []),
            *sections.get("TECHNICAL SKILLS", []),
        ],
        "roles": _parse_resume_roles(sections.get("PROFESSIONAL EXPERIENCE", [])),
        "education_lines": sections.get("EDUCATION", []),
        "header_lines": sections.get("HEADER", []),
    }


def _parse_resume_roles(lines: list[str]) -> list[ParsedResumeRole]:
    roles: list[ParsedResumeRole] = []
    current_role: ParsedResumeRole | None = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        if _looks_like_employer_line(line):
            if current_role is not None:
                roles.append(current_role)
            current_role = ParsedResumeRole(employer=line)
            continue

        if current_role is None:
            continue

        if not current_role.title_line and _looks_like_title_line(line):
            current_role.title_line = line
            continue

        current_role.bullets.append(line.lstrip("-• ").strip())

    if current_role is not None:
        roles.append(current_role)

    return roles


def _looks_like_employer_line(line: str) -> bool:
    return (" – " in line or " - " in line) and "|" not in line and len(line.split()) >= 4


def _looks_like_title_line(line: str) -> bool:
    return "|" in line or re.search(r"\b\d{4}\b", line) is not None


def _modernize_summary(summary: str) -> str:
    cleaned = " ".join(summary.split())
    cleaned = cleaned.replace("Senior Full Stack Application Developer", "Senior Full Stack Developer")
    cleaned = cleaned.replace("as well as", "and")
    cleaned = cleaned.replace(
        "Extensive background across the full Software Development Life Cycle (SDLC), including",
        "Proven experience across the full Software Development Life Cycle (SDLC), including",
    )
    cleaned = cleaned.replace("Strong expertise in", "Deep expertise in")
    return cleaned


def _normalize_skill_lines(skill_lines: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    grouped: dict[str, list[str]] = {}

    for line in skill_lines:
        stripped = line.strip().lstrip("-• ").strip()
        if not stripped:
            continue

        if ":" in stripped:
            label, values = stripped.split(":", 1)
            group_label = label.strip()
            bucket = grouped.setdefault(group_label, [])
            for item in _split_items(values):
                candidate = item.strip()
                if not candidate:
                    continue
                lowered = f"{group_label}:{candidate}".lower()
                if lowered in seen:
                    continue
                seen.add(lowered)
                bucket.append(candidate)
            continue

        for candidate in (_split_items(stripped) or [stripped]):
            clean_candidate = candidate.strip()
            lowered = clean_candidate.lower()
            if not clean_candidate or lowered in seen:
                continue
            seen.add(lowered)
            normalized.append(clean_candidate)

    preferred_group_order = [
        "Programming Languages",
        "Frameworks",
        "Databases",
        "Servers",
        "Tools",
        "Source Control",
        "Security",
    ]

    for label in preferred_group_order:
        values = grouped.get(label, [])
        if values:
            normalized.append(f"{label}: {', '.join(values[:6])}")

    for label, values in grouped.items():
        if label in preferred_group_order or not values:
            continue
        normalized.append(f"{label}: {', '.join(values[:6])}")

    polished: list[str] = []
    polished_seen: set[str] = set()
    for item in normalized:
        clean_item = item.strip()
        lowered = clean_item.lower()
        if not clean_item or lowered in polished_seen:
            continue
        polished_seen.add(lowered)
        polished.append(clean_item)

    return polished[:12]


def _format_role_metadata_line(title_line: str) -> str:
    return f"*{title_line.strip()}*"


def _enhance_role_bullets(bullets: list[str]) -> list[str]:
    enhanced: list[str] = []
    seen: set[str] = set()

    for bullet in bullets:
        cleaned = _enhance_existing_resume_bullet(bullet)
        lowered = cleaned.lower()
        if not cleaned or lowered in seen:
            continue
        seen.add(lowered)
        enhanced.append(cleaned)

    return enhanced[:8]


def _enhance_existing_resume_bullet(bullet: str) -> str:
    text = _clean_sentence(bullet.lstrip("-• ").strip())
    if not text:
        return ""

    updated = text

    prefix_rewrites = [
        ("Led modernization of ", "Modernized "),
        ("Designed and maintained ", "Designed, enhanced, and maintained "),
        ("Cost Minimization efforts by Migration of ", "Reduced costs by migrating "),
        ("Support Management cross-team activities for validation of ", "Supported cross-functional validation of "),
        ("Developed APIs for ", "Developed APIs that enabled "),
    ]
    for source, replacement in prefix_rewrites:
        if updated.startswith(source):
            updated = f"{replacement}{updated[len(source):]}"
            break

    generic_substitutions = [
        (r"\bcross-team and cross agencies\b", "internal teams and partner organizations"),
        (r"\bhelper applications\b", "supporting applications"),
        (r"\bsoftware and frameworks\b", "software products and frameworks"),
        (r"\bsupporting batch and real-time processing\b", "supporting both batch and real-time processing workflows"),
        (r"\bupgrades and deployment processes\b", "upgrade initiatives and release deployment processes"),
        (r"\bautomated deployments and performance testing\b", "automated deployment activities and performance testing"),
    ]
    for pattern, replacement in generic_substitutions:
        updated = re.sub(pattern, replacement, updated, flags=re.IGNORECASE)

    if updated.startswith("Provided production support and "):
        updated = f"Provided production support, issue triage, and {updated[len('Provided production support and '):]}"

    if updated.startswith("Conducted ") and "performance tuning" in updated and "to improve" not in updated:
        updated = f"{updated[:-1]} to improve reliability and maintainability."

    if updated.startswith("Integrated ") and " including " in updated and "to strengthen" not in updated:
        updated = f"{updated[:-1]} to strengthen security and delivery effectiveness."

    return updated


def _build_existing_resume_additional_details(parsed_resume: dict[str, object]) -> list[str]:
    details: list[str] = []
    education_lines = [line for line in parsed_resume.get("education_lines", []) if str(line).strip()]
    header_lines = [line for line in parsed_resume.get("header_lines", []) if str(line).strip()]

    if len(header_lines) > 1:
        details.append(header_lines[1])
    if len(header_lines) > 2:
        details.append(header_lines[2])
    details.extend(education_lines[:2])

    return details[:4]


def _extract_years_of_experience(text: str) -> str:
    match = re.search(r"\b(\d{1,2})\+?\s+years?\b", text, re.IGNORECASE)
    if not match:
        return ""

    years = match.group(1)
    suffix = "+" if "+" in match.group(0) else ""
    return f"{years}{suffix} years"


def _collect_experience_source_lines(
    session: SessionState, impact: str, fact_lines: list[str]
) -> list[str]:
    raw_lines: list[str] = []

    for item in [impact, *fact_lines]:
        cleaned = _clean_sentence(item)
        if cleaned:
            raw_lines.append(cleaned)

    raw_lines.extend(_extract_brain_dump_sentences(session.brain_dump))

    for key, value in sanitize_answer_map(session.answers).items():
        if key in {"tools", "target"}:
            continue
        cleaned = _clean_sentence(value)
        if cleaned and cleaned.lower() != impact.lower():
            raw_lines.append(cleaned)

    deduped: list[str] = []
    seen: set[str] = set()
    for line in raw_lines:
        normalized = line.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(line)

    return deduped


def _enhance_experience_line(line: str) -> str:
    base = _clean_sentence(line)
    if not base:
        return ""

    normalized_base = re.sub(r"^I\s+", "", base, flags=re.IGNORECASE)
    normalized_base = _capitalize_first_character(normalized_base)
    lowered = normalized_base.lower()
    if lowered.startswith(("led ", "managed ", "coordinated ", "supported ", "delivered ", "improved ", "reduced ")):
        return normalized_base

    if "used " in lowered:
        return f"Utilized {normalized_base[5:]}" if len(normalized_base) > 5 else normalized_base
    if "worked in " in lowered:
        return (
            f"Built experience across {normalized_base[10:]}"
            if len(normalized_base) > 10
            else normalized_base
        )
    if "responsible for " in lowered:
        return f"Owned {normalized_base[16:]}" if len(normalized_base) > 16 else normalized_base
    if "helped " in lowered:
        return f"Supported {normalized_base[7:]}" if len(normalized_base) > 7 else normalized_base
    if "kept " in lowered:
        return normalized_base
    if lowered.startswith("have "):
        remainder = normalized_base[5:] if len(normalized_base) > 5 else ""
        if remainder.lower().startswith(tuple(str(i) for i in range(10))):
            return f"Offer {remainder}"
        return f"Bring {remainder}" if remainder else normalized_base
    if lowered.startswith("bring "):
        return normalized_base

    return normalized_base


def _capitalize_first_character(text: str) -> str:
    if not text:
        return text

    return text[0].upper() + text[1:]


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

    meaningful_facts = [fact for fact in session.facts if fact.value.strip() in _meaningful_fact_lines(session.facts)]
    if meaningful_facts:
        labeled_fact = meaningful_facts[0]
        details.append(f"{labeled_fact.label}: {labeled_fact.value}")

    return details[:3]
