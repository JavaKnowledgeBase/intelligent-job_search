# Resume Co-Pilot

Privacy-first resume builder that turns a messy career brain dump into a structured resume draft through guided follow-up questions.

## Workspace

- `apps/web`: Next.js frontend
- `apps/api`: FastAPI backend

## MVP Flow

1. Create a temporary session.
2. Paste a brain dump.
3. Send the brain dump to OpenAI for fact extraction.
4. Send the transcript context to OpenAI for follow-up questions.
5. Build a resume draft.
6. Send transcript plus draft to OpenAI for review.
7. Show the reviewed output to the user.
8. Apply requested final changes.

## Local Development

### Frontend

From the repo root:

```bash
npm install
npm run dev:web
```

### Backend

From `apps/api`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### OpenAI Configuration

Set these environment variables before starting the backend if you want real review and finalization:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
```

If `OPENAI_API_KEY` is not set, the backend falls back to local mock review behavior.
If `OPENAI_API_KEY` is set, extraction, question generation, review, and final revisions all use OpenAI.
