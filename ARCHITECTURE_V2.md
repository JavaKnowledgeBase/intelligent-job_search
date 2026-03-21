# Resume Co-Pilot Architecture v2

## Decision

We should simplify the original design before building.

The best 24-hour architecture is:

- `apps/web`: Next.js app router app for the product UI
- `apps/api`: FastAPI service for orchestration and AI endpoints
- `packages/contracts`: shared TypeScript-first API and data contracts
- session storage abstraction:
  - local development uses in-memory TTL storage
  - deployment can switch to Redis without changing API routes

## Why This Is Better

This keeps the product idea intact while reducing build risk.

Key changes from the earlier docs:

- no WebSocket dependency in MVP
- no mandatory Redis dependency for local development
- no voice ingestion in MVP
- no PDF rendering in MVP
- no persistent database in MVP

Each of those can be added later without breaking the core flow.

## Core Product Loop

1. User starts a temporary session.
2. User enters a career brain dump in text.
3. API extracts structured resume facts.
4. API generates targeted follow-up questions.
5. User answers the questions.
6. API builds an initial resume draft.
7. API reviews transcript plus draft and produces an improved version.
8. User requests final edits if needed.
9. API prepares the final resume.
10. Session expires automatically.

## Frontend

Use Next.js because it gives us:

- fast local iteration
- easy API client integration
- clean deployment options
- built-in routing for a guided multi-step UI

Frontend responsibilities:

- create and hydrate session
- collect intake text
- show extracted facts
- display follow-up questions
- render live resume preview
- export Markdown or JSON

## Backend

Use FastAPI because it gives us:

- fast prototyping
- clean schema validation
- simple async endpoints
- straightforward AI service layering

Backend responsibilities:

- manage session state
- normalize intake input
- generate extracted facts
- identify missing information
- build follow-up prompts
- produce resume draft output
- review transcript plus draft together
- apply user-requested final revisions

## Data Shape

Session state should be centered on one object:

- `sessionId`
- `status`
- `brainDump`
- `facts`
- `questions`
- `answers`
- `resumeDraft`
- `expiresAt`

This is enough for MVP and easy to inspect during development.

## API Surface

- `POST /sessions`
- `GET /sessions/{session_id}`
- `POST /sessions/{session_id}/intake`
- `POST /sessions/{session_id}/questions`
- `POST /sessions/{session_id}/answers`
- `POST /sessions/{session_id}/resume`
- `POST /sessions/{session_id}/review`
- `POST /sessions/{session_id}/finalize`

## AI Layer

Build the AI layer behind one interface:

- `extract_facts`
- `generate_questions`
- `build_resume`
- `review_resume`
- `apply_revision`

For the first working version, start with deterministic mock implementations.
After the flow works, swap in real model calls behind the same interface.

## Storage Strategy

Use an adapter pattern:

- `MemorySessionStore` for local development
- `RedisSessionStore` for deployment

This avoids blocking local progress on infrastructure.

## Export Strategy

MVP export should be:

- Markdown download
- JSON download

PDF can come later once the content quality is strong.

## Deferred Features

These are good ideas, but should not block the first build:

- speech-to-text
- file upload parsing
- PDF generation
- WebSockets
- multi-template theming
- accounts and auth
- analytics

## Build Principle

The first success condition is not polished infrastructure.
The first success condition is a user can paste messy career information and receive a structured, credible resume draft in one sitting.
