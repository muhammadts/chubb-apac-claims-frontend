# Chubb APAC Claims Frontend

Angular application foundation for claimant, claims officer, and manager workspaces. The application uses the existing ASP.NET API as its contract authority. Stage 0 only provides the shared shell, API connection indicator, and a minimal local Express health endpoint.

## Requirements

- Node.js 24.15 or newer in the Node 24 LTS line
- npm 11

## Install and run

```sh
npm install
npm start
```

`npm start` serves Angular at `http://localhost:4200` and proxies `/api` to `http://localhost:5289`, the backend's local HTTP profile. Change the target by copying `.env.example` to `.env` and setting `CLAIMS_API_TARGET` to the backend URL. `.env` is ignored by Git. For a one-off override, set `CLAIMS_API_TARGET` in the process environment before running the command.

Run the Angular shell and local mock health API together with:

```sh
npm run start:demo
```

The mock listens on `http://localhost:4301`; the demo launcher directs the Angular `/api` proxy to it. `npm run mock` starts only the mock API. At this foundation stage, the mock implements only `GET /api/health`; other `/api` requests return Problem Details 404 responses. No claim workflows or login are included.

## Checks

```sh
npm run build
npm test
```

The Angular CLI uses standalone components, strict TypeScript settings, and Vitest for unit tests. API configuration is local development configuration only; do not put access tokens or secrets in frontend files.

## Structure

- `src/app/core/` — application-wide services and configuration
- `src/app/shared/` — shared UI building blocks
- `src/app/features/` — lazy-loaded role workspaces (added in later stages)
- `mock-api/` — local Express API for development walkthroughs
- `docs/` — architecture and backend integration contract

See [the architecture and backend integration plan](docs/Claims_Frontend_Architecture_and_Backend_Integration.md) before implementing future stages.
