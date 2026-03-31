# Next Steps

## Current Status

- Repo pushed to `https://github.com/JavaKnowledgeBase/intelligent-job_search`
- Frontend and backend MVP completed and running
- OpenAI-backed flow implemented for:
  - fact extraction
  - follow-up question generation
  - resume review
  - final revision
- Claude (Anthropic) specialist resume generation added
- CareerPaq branding live
- Docker local and production configs complete
- EC2 production deployment config in place
- Job search cross-promotion integrated (`NEXT_PUBLIC_JOB_SEARCH_URL`)
  - Local Docker → `http://18.216.104.26`
  - Production → `http://apply.careerpaq.com`

## Completed Items

- [x] Add a Dockerfile for `apps/web`
- [x] Add a Dockerfile for `apps/api`
- [x] Create `docker-compose.yml` for local full-stack development
- [x] Create `docker-compose.prod.yml` for EC2 production
- [x] Pass `.env` values safely into the backend container
- [x] Verify frontend-to-backend communication inside Docker
- [x] Test the OpenAI-powered flow inside containers
- [x] Resume template/export phase (Markdown, JSON, DOCX, PDF)
- [x] Transcript download
- [x] Final resume download/export
- [x] Replace placeholder draft builder with dynamic generator
- [x] Add Claude Specialist 2 resume generation
- [x] Add job search cross-promotion banner (welcome screen + workspace sidebar)
- [x] Updated all project documentation (.docx files) to reflect CareerPaq branding and current stack

## Next Priorities

1. Connect `apply.careerpaq.com` service to EC2 and confirm the cross-promotion link works end-to-end
2. Add Nginx reverse proxy config to `docker-compose.prod.yml` so the API is served at `/api`
3. Set up HTTPS / SSL on the EC2 instance (Let's Encrypt or ACM)
4. Upgrade Next.js to a patched version before wider production traffic
5. Add resume template selection (at least 2 layouts: classic and modern)
6. Analytics / session funnel tracking (privacy-respecting, no PII)
7. Consider Redis for session store when horizontal scaling is needed

## Environment Variables Reference

| Variable | Local Docker | Production |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8001` | `/api` |
| `NEXT_PUBLIC_JOB_SEARCH_URL` | `http://18.216.104.26` | `http://apply.careerpaq.com` |
| `OPENAI_API_KEY` | set in `apps/api/.env` | set in EC2 `.env` |
| `ANTHROPIC_API_KEY` | set in `apps/api/.env` | set in EC2 `.env` |
