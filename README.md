# Personal Job Automation

A private, single-user workspace for finding relevant jobs and eventually automating application preparation. Phase 1 establishes the secure foundation only: a Next.js dashboard, Express API, MongoDB and Redis connections, authentication, shared types, and initial persistence models.

## Architecture

- `frontend`: Next.js App Router dashboard and login flow.
- `backend`: Express API with configuration, health checks, JWT authentication, MongoDB models, and Redis client foundation.
- `shared`: TypeScript contracts shared by future frontend and backend features.
- `docs`: Architectural decisions and phase boundaries.

The backend starts in local development even when MongoDB or Redis is unavailable, and exposes their current state through health endpoints. Production startup does not use those development defaults: missing required configuration, or a failed MongoDB or Redis connection, stops the process.

## Local setup

Requirements: Node.js 20+, npm, MongoDB, and Redis.

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `backend/.env` and replace the development secrets. The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local` when it needs a non-default API URL. Leave it unset for local development; the UI then uses `http://localhost:5000/api`.

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

## Production deployment

This layout is for a personal deployment: the API, Redis, and Playwright/Chromium on one EC2 instance, MongoDB Atlas as the database, and the Next.js frontend on Vercel or another host. The frontend is not tied to the EC2 deploy. Set `NEXT_PUBLIC_API_URL` to the public API origin, including the `/api` suffix, before building the frontend.

### Required environment

Backend process environment, for example `/etc/personal-job-automation.env`. Do not commit this file.

| Variable | Production |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | API port. Defaults to `5000` when unset. |
| `MONGODB_URI` | MongoDB Atlas connection string. Required. |
| `REDIS_URL` | Redis URL reachable from EC2. Required. |
| `JWT_SECRET` | Long random signing secret. Required. |
| `ADMIN_EMAIL` | Single admin login. Required. |
| `ADMIN_PASSWORD` | Single admin password. Required. |
| `FRONTEND_URL` | Exact browser origin allowed by CORS, such as `https://jobs.example.com`. Required. A wildcard is rejected. |

Frontend build environment:

| Variable | Production |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Public API base, such as `https://api.example.com/api`. Required at frontend build time. A production bundle does not fall back to localhost. |

### Build and start

On the API host, from the repository root:

```bash
npm install --include=optional
npm run build --workspace backend
npm run start --workspace backend
```

`npm run start --workspace backend` runs the compiled server, `node dist/src/server.js`. `SIGTERM` and `SIGINT` stop accepting requests and then close MongoDB and Redis.

On the frontend host:

```bash
npm install --include=optional
npm run build --workspace frontend
npm run start --workspace frontend
```

Set `NEXT_PUBLIC_API_URL` in the environment before `npm run build --workspace frontend`. Changing it later does not affect an already built bundle.

### MongoDB Atlas

Create a database user and set `MONGODB_URI` to that user's connection string. Allow the EC2 instance's outbound IP in Atlas Network Access. The API logs connection success or failure and does not log the connection string.

### Redis

Install Redis on the EC2 instance and keep it bound to localhost unless you intentionally expose it. Example: `REDIS_URL=redis://127.0.0.1:6379`. Production startup exits if Redis cannot be reached. Queues are not enabled in this phase.

### Playwright and Chromium

Browser automation uses the Playwright package already installed with the backend. On the EC2 instance, as the same Linux user that will run the API:

```bash
cd backend
npx playwright install --with-deps chromium
```

`--with-deps` installs the Ubuntu libraries Chromium needs and may prompt for sudo. Do not set `PLAYWRIGHT_BROWSERS_PATH` to a machine-specific path. Run the API as a normal user so Chromium can use its sandbox. This does not change form detection, approval, or submission behavior.

### Health checks

- `GET /api/health` reports that the process is serving requests.
- `GET /api/health/system` reports `application`, `mongodb`, and `redis` separately. `status` is `healthy` only when both dependencies are connected, otherwise `degraded`.

Neither response includes credentials, connection strings, or candidate data.

### EC2 sequence

1. Use an Ubuntu instance with Node.js 20 and npm. Open SSH to yourself. Open the API port only to the frontend host or to a reverse proxy, not to the whole internet, if you can avoid it.
2. Install and start Redis locally.
3. Clone the repository and create the backend environment file with the production variables above.
4. In Atlas, allow this instance to connect.
5. `npm install --include=optional`, then install Chromium with the Playwright command above.
6. `npm run build --workspace backend` and start it with `NODE_ENV=production` under a process manager that sends `SIGTERM` on stop, such as systemd.
7. Build the frontend elsewhere with `NEXT_PUBLIC_API_URL` pointing at this API. Confirm `FRONTEND_URL` is that frontend's origin.
8. Check `GET /api/health` and `GET /api/health/system` before using the dashboard.

The scheduled job-search worker is not part of this deployment step.

## Phase boundary

Phase 1 intentionally does not include scraping, job matching, LLM processing, resume tailoring, browser automation, credential storage for job sites, application submission, queues, or caching behavior. Phase 2A adds only the offline canonical job foundation: raw input validation, deterministic normalization, and identity preparation. Source integrations, deduplication decisions, freshness, filtering, analysis, matching, ranking, and automation remain deferred.
