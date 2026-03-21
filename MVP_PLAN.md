# Resume Co-Pilot 24-Hour MVP Plan

## Recommendation

Build the first version with:

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: FastAPI
- Session store: Redis with TTL
- AI flow: structured extraction, gap detection, follow-up questions, resume generation
- Output: on-screen resume preview plus downloadable Markdown/JSON in MVP

This matches the newer documents and is the fastest path to a working prototype.

## Why This Idea Is Strong

The concept is compelling because it is not just "another resume builder."
Its differentiators are:

- privacy-first positioning
- conversational discovery instead of form fatigue
- structured fact extraction
- guided follow-up questions to pull out strong achievements

That combination feels genuinely useful and marketable.

## Biggest Risks

The main risks are product focus, not engineering:

- trying to ship voice, file upload, PDF export, and multi-template support on day one
- over-investing in polish before the interview flow works
- letting architecture expand before the first end-to-end loop is real

For a 24-hour build, we should keep the MVP narrow.

## 24-Hour MVP Scope

Ship only this:

1. User starts a session.
2. User pastes or types a brain dump.
3. Backend extracts structured resume facts.
4. Backend identifies missing or weak areas.
5. UI asks 3 to 5 targeted follow-up questions.
6. User answers them.
7. System generates a clean resume draft.
8. User downloads the draft as Markdown or JSON.

## Explicitly Out Of Scope For Day 1

- speech input
- file ingestion from LinkedIn or PDF
- enterprise features
- authentication
- persistent accounts
- fancy template marketplace
- production deployment

## Suggested Build Order

### Phase 1

- create monorepo structure
- scaffold Next.js app
- scaffold FastAPI app
- define shared resume schema

### Phase 2

- implement session creation and TTL handling
- implement `extract`, `analyze`, and `build` endpoints
- add mock AI responses first so the UI flow works immediately

### Phase 3

- build chat-style intake UI
- build facts review panel
- build resume preview panel

### Phase 4

- replace mocks with real LLM calls
- add export
- test the full flow end-to-end

## Core API Shape

- `POST /session`
- `POST /session/{id}/extract`
- `POST /session/{id}/analyze`
- `POST /session/{id}/answer`
- `POST /session/{id}/build`
- `GET /session/{id}`

## Data Model

The structured session should roughly contain:

- profile
- summary
- experience
- education
- skills
- projects
- extracted_facts
- open_questions
- draft_resume

## My Read

I like this project.

It has a real user pain point, a clear AI-native interaction model, and a sharp positioning angle around privacy. The strongest move now is to treat the first 24 hours as an MVP sprint, not a platform build.

## Next Move

Start with the newer stack:

- Next.js frontend
- FastAPI backend
- Redis TTL sessions

Then get one complete text-only resume-generation loop working before anything else.
