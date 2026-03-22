# Resume Co-Pilot

Privacy-first resume builder that turns a messy career brain dump into a structured resume draft through guided follow-up questions, editable extracted facts, and export options.

## Workspace

- `apps/web`: Next.js frontend
- `apps/api`: FastAPI backend

## MVP Flow

1. Create a temporary session.
2. Paste a brain dump.
3. Send the brain dump to OpenAI for fact extraction.
4. Send the transcript context to OpenAI for follow-up questions.
5. Review and edit extracted facts if needed.
6. Build a resume draft.
7. Send transcript plus draft to OpenAI for review.
8. Show the reviewed output to the user.
9. Apply requested final changes.
10. Export the output as Markdown, JSON, DOCX, or PDF.

## Local Development

### Frontend

From the repo root:

```bash
npm install
npm run dev:web
```

The frontend runs on `http://localhost:3001` when started with:

```bash
npm --workspace apps/web run dev -- --port 3001
```

### Backend

From `apps/api`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend default local URL for this project is `http://localhost:8001`. You can start it with:

```bash
uvicorn app.main:app --reload --port 8001
```

### OpenAI Configuration

Set these environment variables before starting the backend if you want real review and finalization:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
```

Keep these values in [apps/api/.env](c:/Users/rkafl/Documents/Projects/resume-intellegence/apps/api/.env) locally. That file is git-ignored already.

If `OPENAI_API_KEY` is not set, the backend falls back to local mock review behavior.
If `OPENAI_API_KEY` is set, extraction, question generation, review, and final revisions all use OpenAI.

## Current Features

- text, upload, and browser voice intake
- editable extracted facts before draft generation
- guided follow-up questions
- OpenAI-backed or local-fallback draft generation
- transcript download
- resume export to Markdown, JSON, DOCX, and PDF

## User Walkthrough

### Welcome And Intake

When a user opens the app, they begin on the welcome screen.
The app explains the full process in plain language and lets them start in the easiest way for them:

- type a career story directly
- upload a TXT, MD, DOCX, or PDF file
- use browser voice dictation when supported

The goal of this first step is simple: capture the user's background, strengths, tools, accomplishments, and target role in one place.

### Extract Facts

After the user clicks `Extract Facts`, the app turns the raw story into structured resume facts.
These facts are meant to be easier to review than a long paragraph.

Users can then:

- review the extracted facts
- edit wording
- add missing facts
- remove weak or incorrect facts
- refresh follow-up questions if the facts change

### Follow-Up Questions

Once the facts are ready, the app asks targeted follow-up questions.
These questions are meant to strengthen the draft by filling in missing details such as:

- measurable impact
- tools and platforms
- target role
- scope or responsibilities

### Draft, Review, And Finalize

After the user answers the follow-up questions, the app builds a resume draft.
The user can then:

- review the generated transcript
- run an AI review pass on the draft
- request final edits in plain language

If OpenAI is unavailable, the app falls back to a local draft and review path so the flow can still continue.

### Export Options

After the draft or final version is ready, the user can download:

- transcript as Markdown
- resume as Markdown
- resume as JSON
- resume as DOCX
- resume as PDF

This makes the app useful both for direct resume editing and for passing structured output into later tools or workflows.

## Docker

Create [apps/api/.env](c:/Users/rkafl/Documents/Projects/resume-intellegence/apps/api/.env) first, then from the repo root run:

```bash
docker compose up --build
```

Docker port mappings:

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:8001`
