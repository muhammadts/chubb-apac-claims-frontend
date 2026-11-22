# Frontend development rules

Build the Chubb APAC claims frontend in this frontend repository only. Before coding, read `docs/Claims_Frontend_Architecture_and_Backend_Integration.md` and the backend contract in the existing backend README/OpenAPI if available. The current backend is the contract authority. Do not invent routes, fields, policy rules, market codes, staff directories, document upload, notifications, totals, or SLA metrics.

Use Angular for the application and Node.js for the Express mock API. The same Angular application serves Claimant, ClaimsOfficer, and Manager workspaces. Real API mode calls the existing ASP.NET API over REST with configured OIDC access tokens. Mock mode calls only the local Node mock and may use clearly marked mock personas. Never send mock identity headers or demo tokens to the real API. The frontend never connects directly to Kafka; the backend owns its Kafka outbox.

Work only on the current stage. Inspect branch/status and preserve user work. Create the current stage's named branch from latest main only after the previous PR has been merged. Treat the architecture file under `docs/` as intentional project input; do not delete, stash, or make the user commit it just to pass a clean-worktree check. Stop on other unexpected uncommitted changes and report them. Do not change the backend repository.

Keep API contracts typed and centralized, feature areas lazy-loaded, request state explicit, and claimant/staff DTO projections separate. Respect `If-Match` ETags, opaque cursor pagination, Problem Details, role and scope authorization, and the capability gaps listed in the architecture. No secrets or real claim data in Git. Keep claims data out of local storage.

Implement the smallest complete slice for the current stage, add focused tests for new behavior, run relevant build/tests, inspect the diff, and report exact outcomes and limitations. Stop after reporting with changed file list and a suggested manual commit message. Never commit, push, create/merge a PR, or move to another stage without the user's next prompt.

## Git workflow — separate branch per stage

Create a fresh feature branch for each stage from the latest `main`, after the preceding PR is merged:

| Stage | Branch |
|---|---|
| 0 — Frontend foundation | `feature/frontend-foundation` |
| 1 — API contracts and mock contract | `feature/frontend-contracts` |
| 2 — App shell and identity modes | `feature/frontend-shell-auth` |
| 3 — Claimant journey | `feature/claimant-journey` |
| 4 — Officer workflow | `feature/officer-workflow` |
| 5 — Manager workspace | `feature/manager-workspace` |
| 6 — Resilience and edge cases | `feature/frontend-resilience` |
| 7 — Final quality and documentation | `feature/frontend-quality` |

After each stage, stop and report changed files and checks, then suggest a manual commit message. The user reviews and commits, pushes, and creates/merges that stage's PR before providing the next stage. Never commit, push, create/merge PRs, or start another stage automatically. Never work on `main`.
