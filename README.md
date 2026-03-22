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

## Docker

Create [apps/api/.env](c:/Users/rkafl/Documents/Projects/resume-intellegence/apps/api/.env) first, then from the repo root run:

```bash
docker compose up --build
```

Docker port mappings:

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:8001`
