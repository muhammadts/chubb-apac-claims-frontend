# AI Working Journal

## Stage 7 prompt

The user's prompt asked for a final repository review, documentation, and demo-readiness pass. It required confirming the resilience PR merge, updating `main`, creating `feature/frontend-quality`, reviewing claimant/officer/manager requirements against the backend contract, fixing scoped gaps, documenting setup and limits, running checks, and stopping without committing or pushing.

## Decisions and reasons

| Decision | Basis |
|---|---|
| Used Git refs instead of GitHub CLI to confirm merge | GitHub CLI authentication was unavailable, while `origin/main` contained merge commit `2337af3` for PR #6. |
| Created `feature/frontend-quality` from fetched `main` | The resilience PR was present in merged history. |
| Did not change the architecture or backend repository | Both were explicit source-of-truth boundaries. |
| Matched mock seed owners to `mock-claimant` | Baseline mock claimant ownership used `claimant`, which did not match the Angular persona subject and prevented the default demo claim list/detail from working. |
| Added conspicuously marked mock market/team configuration | The default demo needed submit and assignment choices, but only mock fixtures may invent `MOCK` values. API deployments must replace these values with owner-approved configuration. |
| Kept the backend OpenAPI snapshot unverified | `/health` and `/openapi/v1.json` on port 5289 timed out in the environment. No live schema was invented or committed. |
| Kept unsupported capabilities absent | Documents, policy, staff directory discovery, notifications, WebSocket/SSE, Kafka, and cross-currency totals are contract gaps, not frontend features. |

## Accepted and challenged assumptions

- Accepted the architecture's default backend endpoint `http://localhost:5289` and `/api/v1` route model.
- Accepted that OIDC PKCE can be browser-configured only through public runtime settings.
- Challenged the current README-only statement that mock persona support was later-stage or incomplete by wiring its seeded owner IDs to the persona IDs already exposed by the shell.
- Rejected the idea of creating a backend OpenAPI snapshot without a live endpoint or a backend repository source.

## Overrides

- No product or contract requirements were overridden.
- The mock config override is demo-only and explicitly reversible by replacing `public/claims-config.js` for API deployment.

## Checks performed

- Git worktree and branch state checked.
- Resilience merge checked from `origin/main` merge history.
- Angular build passed.
- Angular unit tests passed: 13 files, 49 tests.
- Express mock contract tests passed after a final rerun: 6 tests.
- An initial contract rerun exposed a missing defensive activities array in the mock mutation path; the mock was hardened and rerun passed.
- A demo launcher smoke attempt confirmed the mock API started, but Angular could not bind port 4200 because that port was already occupied by the existing development page in the environment.
- Backend `/health` and `/openapi/v1.json` probes timed out.
- Live OIDC issuer and live JWT authorization were not available.

## Environment limitations

No live ASP.NET API, live OpenAPI, OIDC issuer, SQL Server, or deployed backend scope claims were available during this pass. Mock-mode validation covers the local HTTP contract and the complete persona shell. Real API route and live-auth behavior remain dependent on a configured backend and issuer.
