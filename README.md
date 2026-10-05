# Personal Job Automation

A private, single-user workspace for finding relevant jobs and eventually automating application preparation. Phase 1 establishes the secure foundation only: a Next.js dashboard, Express API, MongoDB and Redis connections, authentication, shared types, and initial persistence models.

## Architecture

- `frontend`: Next.js App Router dashboard and login flow.
- `backend`: Express API with configuration, health checks, JWT authentication, MongoDB models, and Redis client foundation.
- `shared`: TypeScript contracts shared by future frontend and backend features.
- `docs`: Architectural decisions and phase boundaries.

The backend starts even when MongoDB or Redis is unavailable, and exposes their current state through health endpoints. This keeps local diagnostics available while preserving a clear degraded status.

## Local setup

Requirements: Node.js 20+, npm, MongoDB, and Redis.

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `backend/.env` and replace the development secrets. The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local` when it needs a non-default API URL.

3. Start MongoDB and Redis locally, or point `MONGODB_URI` and `REDIS_URL` at reachable instances.

4. Start both applications:

   ```bash
   npm run dev
   ```

   Frontend: `http://localhost:3000`
   Backend: `http://localhost:5000`

## Environment variables

| Variable              | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `NODE_ENV`            | Runtime environment.                                         |
| `PORT`                | Express port.                                                |
| `MONGODB_URI`         | MongoDB connection string.                                   |
| `REDIS_URL`           | Redis connection string.                                     |
| `JWT_SECRET`          | Secret used to sign admin sessions. Use a long random value. |
| `ADMIN_EMAIL`         | The single permitted admin email.                            |
| `ADMIN_PASSWORD`      | The single permitted admin password.                         |
| `FRONTEND_URL`        | Allowed browser origin for CORS.                             |
| `NEXT_PUBLIC_API_URL` | Browser-visible backend API base URL.                        |

Never commit `.env` files or real credentials. The development login uses the configured `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Useful commands

```bash
npm run dev
npm run build
npm run typecheck
npm run build --workspace backend
npm run build --workspace frontend
npm run typecheck --workspace backend
npm run typecheck --workspace frontend
```

Health endpoints:

- `GET http://localhost:5000/api/health`
- `GET http://localhost:5000/api/health/system`

The login and dashboard routes are available at `/login` and `/dashboard`. Dashboard data is protected by the JWT returned from `/api/auth/login`.

## Phase boundary

Phase 1 intentionally does not include scraping, job matching, LLM processing, resume tailoring, browser automation, credential storage for job sites, application submission, queues, or caching behavior. Phase 2A adds only the offline canonical job foundation: raw input validation, deterministic normalization, and identity preparation. Source integrations, deduplication decisions, freshness, filtering, analysis, matching, ranking, and automation remain deferred.
