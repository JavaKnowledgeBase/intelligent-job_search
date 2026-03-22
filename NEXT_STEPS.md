# Next Steps

## Current Status

- Repo pushed to `https://github.com/JavaKnowledgeBase/intelligent-job_search`
- Frontend and backend MVP scaffold completed
- OpenAI-backed flow implemented for:
  - fact extraction
  - follow-up question generation
  - resume review
  - final revision
- Torilaure branding added to the UI
- Local `.env` is in use and ignored by git

## Important Notes

- Docker Desktop setup is the next major task
- The laptop needs to be restarted before Docker work begins
- After restart, we should continue from the latest pushed repo

## Immediate To-Do After Restart

1. Add a Dockerfile for `apps/web`
2. Add a Dockerfile for `apps/api`
3. Create `docker-compose.yml` for local full-stack development
4. Pass `.env` values safely into the backend container
5. Verify frontend-to-backend communication inside Docker Desktop
6. Test the OpenAI-powered flow inside containers
7. Start the resume template/export phase once containers are stable

## Nice-To-Have After Docker

1. Replace the placeholder draft builder with a more dynamic first-draft generator
2. Add transcript download
3. Add final resume download/export
4. Upgrade Next.js to a patched version before production deployment
