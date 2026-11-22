# Chubb APAC Claims Frontend

Angular application foundation for claimant, claims officer, and manager workspaces. The application uses the existing ASP.NET API as its contract authority. The centralized contract/client is in `src/app/core/claims-api.ts`; the local Express implementation is development-only mock data.

## Requirements

- Node.js 24.15 or newer in the Node 24 LTS line
- npm 11

## Install and run

```sh
npm install
npm start
```

`npm start` serves Angular at `http://localhost:4200` and proxies `/api` to `http://localhost:5289`, the backend's local HTTP profile. Change the target by copying `.env.example` to `.env` and setting `CLAIMS_API_TARGET` to the backend URL. `.env` is ignored by Git. For a one-off override, set `CLAIMS_API_TARGET` in the process environment before running the command.

Run Angular and the local mock API together with:

```sh
npm run start:demo
```

The mock listens on `http://localhost:4301`; the demo launcher directs Angular's `/api` proxy to it. The proxy rewrites `/api/health` to mock `GET /health`. `npm run mock` starts only the mock API. Reset deterministic in-memory fixtures with `POST http://localhost:4301/__mock/reset`.

Mock endpoints require mock-only request headers: `x-mock-role` (`Claimant`, `ClaimsOfficer`, or `Manager`), `x-mock-sub`, `x-mock-market`, and `x-mock-team`. The mock never uses these as real API credentials. The seeded fixtures use the conspicuously fake `MOCK` market/team values and `.invalid` claimant email. The Angular identity/persona adapter is a later stage; callers of the mock routes must supply these headers explicitly until then. Every mock response is local fixture data, never a response from the backend.

The typed API service covers the documented claimant, staff, and manager endpoints. It preserves query and JSON field casing, GUID claim route IDs, quoted response ETags and `If-Match`, and separate claimant/staff detail projections. Mock pagination uses an opaque base64url cursor and returns `{ items, nextCursor }`. Mock mutation conflicts return Problem Details with `409`; transitions are limited to documented workflow actions. Manager reports identify fixture assumptions and do not combine currencies or assert SLAs.

Claimant submissions use the fixed Motor and Property DTOs from the backend contract. Market choices have no backend catalog endpoint and are intentionally not seeded: configure only backend-approved `{ code, name }` entries in `window.__CLAIMS_CONFIG__.markets` in `public/claims-config.js`. If the list is absent or empty, the form displays a setup state and cannot submit. Never add policy-number or document-upload fields; those capabilities are not part of the current submission API.

The claimant dashboard/list, typed submission review and confirmation, claim detail, status and timeline, and text-only information-request response are available under `/claimant`. Claim reads are scoped to the signed-in claimant. Writes use a 30-second client timeout; an uncertain submission refreshes the claim list and is never automatically reposted. Information responses use the current detail ETag and reload the claim after success or a `409` conflict.

Claims officers use `/officer/queue` and `/officer/claims/:claimId`. The queue uses the backend's cursor and supported filters; the workbench reads staff-only details and refreshes the ETag before every action. Team/officer choices are not available from an API: configure approved `teamId`/`displayName` entries and their `officers` (`subjectId`/`displayName`) in `window.__CLAIMS_CONFIG__.staffDirectory.teams`, or assignment remains unavailable. This runtime configuration is public browser data, not a place for secrets. Settlement workflow completion is not a payment.

## App shell and identity modes

The shared shell displays role-specific links and lazy-loads the claimant, officer, and manager route areas. These client route guards improve navigation only; the ASP.NET backend remains authoritative for authentication, roles, market/team scope, and resource access.

Runtime settings are in `public/claims-config.js`, which is public browser configuration and must never contain secrets. Set `mode` to `mock` for the local demo or `api` for the ASP.NET API. Set `apiBaseUrl` to the same target used by the `/api` development proxy. Mock identity headers are attached only in mock mode when this configured URL uses `localhost`, `127.0.0.1`, or `::1` on port `4301`. The mock selector exposes the explicit local claimant, officer, and manager fixture personas, all scoped to the fixture's `MOCK` market and `MOCK-TEAM` team.

API mode uses a browser Authorization Code + PKCE redirect with settings for `issuer`, `clientId`, `redirectUri`, and optional `scope`. Configure the identity provider to allow the exact redirect URI and public-client token exchange. No client secret or demo token is used. Access tokens stay in memory and are sent as bearer tokens only to app API requests. The current slice does not implement refresh-token renewal; after expiration the user must sign in again. Role parsing is only for navigation visibility and does not grant backend access. If OIDC settings are missing, the shell explains how to configure API sign-in and mock mode remains selectable through runtime configuration.

The backend OpenAPI endpoint was unavailable when this contract layer was prepared. See [contracts/README.md](contracts/README.md): live schema comparison is unverified and the architecture document remains the checked-in contract source.

## Checks

```sh
npm run build
npm test
npm run test:contracts
```

The Angular CLI uses standalone components, strict TypeScript settings, and Vitest for unit tests. API configuration is local development configuration only; do not put access tokens or secrets in frontend files.

## Structure

- `src/app/core/` — application-wide services and configuration
- `src/app/shared/` — shared UI building blocks
- `src/app/features/` — lazy-loaded role workspaces (added in later stages)
- `mock-api/` — local Express API for development walkthroughs
- `docs/` — architecture and backend integration contract

See [the architecture and backend integration plan](docs/Claims_Frontend_Architecture_and_Backend_Integration.md) before implementing future stages.
