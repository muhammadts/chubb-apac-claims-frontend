# Chubb APAC Claims Frontend

Angular frontend for claimant, ClaimsOfficer, and Manager claim workspaces. The frontend is a REST-only client for the existing ASP.NET claims backend; the Node/Express API is a development fixture implementation, not a second backend.

## Architecture

- Angular standalone components and lazy-loaded claimant, officer, and manager route areas.
- Central typed REST client in `src/app/core/claims-api.ts`.
- Shared OIDC/mock identity adapter in `src/app/core/auth.ts`.
- Angular `/api` proxy in API mode or to the local Node mock in demo mode.
- ASP.NET backend owns SQL, JWT authorization, and its Kafka transactional outbox.
- Express mock owns only in-memory seeded fixtures and workflow transitions.
- Browser state is transient. Claim data and drafts are not stored in local storage or session storage. Session storage is used only for a temporary mock/API mode override and OIDC PKCE state.

```text
Browser -> Angular -> /api -> dev proxy -> ASP.NET :5289
                              -> Node mock :4301
```

The frontend never uses Kafka, WebSockets, SSE, notifications, or binary document APIs.

## Prerequisites

- Node.js 24.15 or newer in the Node 24 LTS line
- npm 11
- A running ASP.NET backend for API mode
- An issuer that supports Authorization Code + PKCE for API sign-in

Pin and use the repository package versions from `package-lock.json`.

```sh
npm install
```

## API mode

`npm start` serves Angular at `http://localhost:4200` and proxies `/api` to `http://localhost:5289` by default.

```sh
# .env (gitignored)
CLAIMS_API_TARGET=http://localhost:5289
npm start
```

Or provide a one-off process override:

```sh
CLAIMS_API_TARGET=http://localhost:5289 npm start
```

The HTTPS launch profile is `https://localhost:7038`. Set `CLAIMS_API_TARGET` to that URL when using it.

Set public browser configuration in `public/claims-config.js`:

```js
window.__CLAIMS_CONFIG__ = {
  mode: 'api',
  apiBaseUrl: 'http://localhost:5289/api/v1',
  claimRefreshIntervalMs: 60000,
  markets: [
    // Insert only market codes/names approved by the backend owner.
  ],
  staffDirectory: { teams: [
    // Insert only approved team/officer IDs supplied by local configuration.
  ] },
  oidc: {
    issuer: 'https://issuer.example',
    clientId: 'public-browser-client',
    redirectUri: 'http://localhost:4200/',
    scope: 'openid profile',
  },
};
```

The redirect URI must be registered with the issuer. The issuer's discovery document must publish `authorization_endpoint` and `token_endpoint`. This implementation has no client secret, demo bearer token, refresh-token renewal, or backend login endpoint. Access tokens remain in memory.

The JWT must contain a stable `sub`, one of `Claimant`, `ClaimsOfficer`, or `Manager` in `role`/`roles`, and staff team/market scope in `team`/`teams` and `market`/`markets` claims. Navigation guards are not authorization; the backend validates every route.

## Mock demo mode

Run Angular and the local mock together:

```sh
npm run start:demo
```

The mock listens on `http://localhost:4301`; the launcher changes the Angular proxy target to it.

For separate processes:

```sh
npm run mock
npm start
```

Set `mode: 'mock'` and `apiBaseUrl: 'http://localhost:4301/api/v1'` in `public/claims-config.js`. The default file contains conspicuously named `MOCK` demo configuration and personas.

Reset in-memory fixtures:

```sh
curl -X POST http://localhost:4301/__mock/reset
```

The persona selector provides:

- Claimant: `mock-claimant`
- ClaimsOfficer: `mock-officer`
- Manager: `mock-manager`

The persona sends `x-mock-*` headers only to the local mock. The interceptor never adds bearer tokens or mock headers to a real API target.

## Supported routes

All routes are under `/api/v1`. IDs are GUID route keys.

### Claimant

| Method | Route | Contract |
|---|---|---|
| POST | `/claims` | Fixed Motor/Property submission; returns mutation result and ETag |
| GET | `/claims` | Own claims, opaque cursor paging |
| GET | `/claims/{claimId}` | Claimant-safe detail and ETag |
| GET | `/claims/{claimId}/status` | Status and ETag |
| GET | `/claims/{claimId}/timeline` | Claimant-visible timeline paging |
| POST | `/claims/{claimId}/information-requests/{requestId}/responses` | Text response, current `If-Match` |

### Claims officer

| Method | Route | Contract |
|---|---|---|
| GET | `/staff/claims` | Scoped, cursor-paginated queue |
| GET | `/staff/claims/{claimId}` | Staff detail and ETag |
| POST | `/staff/claims/{claimId}/assignment` | Team/officer assignment |
| POST | `/staff/claims/{claimId}/review` | Start review |
| POST | `/staff/claims/{claimId}/information-requests` | Request information |
| POST | `/staff/claims/{claimId}/resume-review` | Resume review |
| POST | `/staff/claims/{claimId}/assessments` | Assessment and optional reserve |
| POST | `/staff/claims/{claimId}/decision` | Approved/Rejected decision |
| POST | `/staff/claims/{claimId}/internal-notes` | Staff-only note |
| POST | `/staff/claims/{claimId}/settlement-workflow` | Records workflow completion; does not pay |

### Manager

| Method | Route | Contract |
|---|---|---|
| GET | `/manager/workload` | Scoped workload and ageing |
| GET | `/manager/performance` | From/to UTC interval report |
| GET | `/manager/exposure` | Market/currency exposure groups |

### Platform

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Health check through `/api/health` |
| GET | `/openapi/v1.json` | Development OpenAPI on backend |
| GET | `/swagger` | Development Swagger UI on backend |

The live ASP.NET OpenAPI endpoint was not available during earlier frontend stages. The architecture document and actual centralized client remain the contract source until a reviewed `contracts/backend-openapi-v1.json` snapshot is added.

## Demo walkthrough

1. Run `npm run start:demo`.
2. Open `http://localhost:4200`.
3. Select the Claimant persona.
4. Open `Start a claim`, choose `MOCK`, enter the fixed Motor or Property fields, review, and submit.
5. Open the submitted claim or seeded `MOCK-0002`.
6. For `MOCK-0002`, the officer persona can read the open information request and request/answer text as permitted.
7. Use the Officer persona and open `/officer/queue`.
8. Open a seeded claim and exercise assignment, review, information request, assessment/reserve, decision, internal note, and settlement workflow as status transitions permit.
9. Use the Manager persona to open overview, performance, and exposure. The mock exposure page intentionally reports no cross-currency amounts.
10. Reset fixtures with `POST /__mock/reset` when restarting the scenario.

Deep links and role routes are guard-protected in the browser, but the backend remains authoritative. A user can switch personas only in mock mode.

## Contract behavior

- Read quoted `ETag` response headers and send the exact value as `If-Match` on mutations.
- On success, replace the local ETag and refresh detail state.
- On `409`, reload the claim and require a deliberate retry; stale writes are not replayed.
- Cursor values are opaque. `pageSize` is 1–100 and reset when filters change.
- Problem Details map to field, page, or banner errors for `400`, `401`, `403`, `404`, `409`, and `5xx`.
- Claim submissions have a 30-second timeout. An unknown submission outcome refreshes the claimant list before any resubmission invitation.
- Claim and officer detail views poll visible REST state at 30–300 seconds, pause when hidden, and show last-refresh time. Manager reports refresh manually.

## Known limits

The frontend intentionally does not implement:

- document upload/download or attachments
- policy lookup or policy-number submission
- market catalog discovery
- teams/officer directory discovery
- notifications, WebSocket, SSE, Kafka browser clients
- idempotency keys
- claimant staff rationale
- cross-currency totals or inferred SLAs

Configured market and staff values must be supplied or approved outside this repository. Assignment and submission show setup states when configuration is absent. Settlement workflow completion is not payment.

## Checks

```sh
npm run build
npm test -- --watch=false
npm run test:contracts
```

Contract tests use the Express mock. Angular tests use Angular HttpTestingController fixtures and do not require a backend or issuer.

## Security and privacy

- Never commit access tokens, client secrets, issuer admin credentials, or real claim data.
- Runtime configuration is public browser data.
- Keep claims and drafts out of local/session storage; the application only uses session storage for PKCE state and temporary mode selection.
- Use HTTPS and exact issuer redirect URIs outside local development.
- Mock identities and the `MOCK` market/team are demo-only and must not be sent to the real API.
- Staff detail and rationale are staff-only UI projections; the backend remains the final access control.

## Candidate repository assessment

The public `naeemabbas05/insurance-claims-frontend` README/repository listing was used as a feature/presentation reference only. Useful ideas include separate workspaces, typed API access, reusable loading/error feedback, and accessibility/responsive focus.

It is not a drop-in client for this backend. Its candidate routes, claim-reference model, reports, attachment/notification paths, and dynamic form assumptions differ from this contract. The current implementation therefore follows the checked-in architecture and the actual `/api/v1` routes, fixed Motor/Property DTOs, GUID claim IDs, ETags, and cursor contracts.
