# Personal Job Automation

A private, single-user workspace for finding relevant jobs and eventually automating application preparation. Phase 1 establishes the secure foundation only: a Next.js dashboard, Express API, MongoDB and Redis connections, authentication, shared types, and initial persistence models.

## Architecture

- `frontend`: Next.js App Router dashboard and login flow.
- `backend`: Express API with configuration, health checks, JWT authentication, MongoDB models, and Redis client foundation.
- `shared`: TypeScript contracts shared by future frontend and backend features.
- `docs`: Architectural decisions and phase boundaries.

The backend starts in local development even when MongoDB or Redis is unavailable, and exposes their current state through health endpoints. Production startup does not use those development defaults: missing required configuration, or a failed MongoDB or Redis connection, stops the process.

## Local setup

Requirements: Node.js 20+, npm, MongoDB, and a `REDIS_URL` for the managed Upstash Redis instance.

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `backend/.env` and replace the development secrets. The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local` when it needs a non-default API URL. Leave it unset for local development; the UI then uses `http://localhost:5000/api`.

3. Start MongoDB, or point `MONGODB_URI` at Atlas. Point `REDIS_URL` at the Upstash Redis instance. A local Redis installation is not required.

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

Redis is a managed Upstash instance. Set `REDIS_URL` to that TCP connection string in the environment. The API and the worker both use this value through the existing Redis client. Do not commit the connection string. Production startup exits if Redis cannot be reached. The daily discovery queue also lives in this Redis instance.

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
2. Clone the repository and create the backend environment file with the production variables above, including the Upstash `REDIS_URL`.
3. In Atlas, allow this instance to connect.
4. `npm install --include=optional`, then install Chromium with the Playwright command above.
5. `npm run build --workspace backend`, then start the API with `npm run start --workspace backend` and the worker with `npm run start:worker --workspace backend`. Use a process manager that sends `SIGTERM` on stop.
6. Build the frontend elsewhere with `NEXT_PUBLIC_API_URL` pointing at this API. Confirm `FRONTEND_URL` is that frontend origin.
7. Check `GET /api/health` and `GET /api/health/system` before using the dashboard.

## Background worker

The API and the worker are separate processes. The API serves the dashboard and does not schedule discovery. The worker connects to the same MongoDB database and the same Upstash Redis instance, then runs the scheduler and the queue consumer.

Start them from the repository root:

```bash
npm run dev --workspace backend
npm run worker --workspace backend
```

After `npm run build --workspace backend`:

```bash
npm run start --workspace backend
npm run start:worker --workspace backend
```

`REDIS_URL` is read from the environment. Nothing in the worker hardcodes the Redis host, username, or password.

### Daily schedule

The scheduler runs inside the worker. It enqueues one `JOB_DISCOVERY` job at 08:00 Asia/Kolkata, Monday through Friday. Saturday and Sunday are skipped. The schedule is not an operating-system cron job.

The idempotency key is `job-discovery:YYYY-MM-DD:Asia/Kolkata`. Redis stores that key with `SET NX`, so a worker restart later the same day does not enqueue a second discovery job. If enqueue itself fails, the key is removed and the next check can try again.

### Queue

Pending, processing, retry, and failed job state stays in Redis. A job is claimed by moving it from the pending list to the processing list. It is retried up to 3 attempts with a short backoff, then marked failed. The worker does not submit applications. Discovery calls the existing ingestion orchestrator, deterministic matcher, and job upsert path. Approve & Submit remains a separate, explicit user action.

## Phase boundary

Phase 1 intentionally does not include scraping, job matching, LLM processing, resume tailoring, browser automation, credential storage for job sites, application submission, queues, or caching behavior. Phase 2A adds only the offline canonical job foundation: raw input validation, deterministic normalization, and identity preparation. Source integrations, deduplication decisions, freshness, filtering, analysis, matching, ranking, and automation remain deferred.
