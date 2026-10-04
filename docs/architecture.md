# Phase 1 Architecture Decisions

## Single-user boundary

The application is optimized for one private admin user. There is no public registration flow. The API compares login credentials against environment-managed admin credentials and issues a short-lived JWT for protected dashboard APIs.

## Persistence

MongoDB is the source of truth for candidate profiles, jobs, and applications. Mongoose schemas use strict mode, timestamps, references, and indexes needed by the initial data model. Application records are never deleted by Phase 1 code, preserving an indefinite history.

Candidate data explicitly separates verified information, related technology, and unknown information. Empty fields remain empty; later automation must not infer candidate facts without approval.

## Service health

MongoDB and Redis connections are initialized during API startup. Connection errors are logged without secrets and represented in health responses. Redis is exposed as a reusable client only; queues and caching are intentionally deferred.

## Error handling

All API responses use a `success` flag and an optional `message` or `data` payload. Unknown routes return `404`. The centralized error handler logs the error message and hides unexpected server details when `NODE_ENV=production`.

## Frontend boundary

The Next.js frontend owns the login and dashboard presentation. It stores the temporary JWT in browser local storage for this personal MVP and sends it as a Bearer token to protected endpoints. A later security phase can replace this with an HTTP-only session cookie without changing the domain models.
