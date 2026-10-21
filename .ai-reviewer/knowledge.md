# DMS reviewer notes

## Architecture

RESQ is an npm-workspaces monorepo with an Express/MongoDB/TypeScript backend in `server/` and a React/Vite frontend in `client/`. Backend controllers are intentionally thin; business logic belongs in `server/src/services/` and `server/src/analyzers/`, while routes, middleware, models, validators, and utilities are separated by concern. The deterministic assessment engine is authoritative, with the optional Anthropic layer adding validated narrative guidance without affecting core assessment results.

## Conventions

- Use strict TypeScript settings. Both `client/tsconfig.json` and `server/tsconfig.json` enable `"strict": true`; client code also forbids unused locals/parameters and fallthrough switches.
- Use ESM imports with explicit `.js` extensions in server source, e.g. `server/src/ai/index.ts` importing `../config/env.js`.
- Keep controllers thin and put business rules in services/analyzers, as documented in `README.md`. Do not duplicate assessment or lifecycle logic in HTTP handlers.
- Centralize assessment tuning in `server/src/analyzers/assessmentConfig.ts`; changes to weights, thresholds, signals, or population bands should not be embedded directly in `disasterAssessment.ts`.
- Treat deterministic assessment output as authoritative. `server/src/ai/prompt.ts` explicitly instructs AI not to re-score or contradict it.
- AI providers must implement `AiProvider` from `server/src/ai/types.ts` and be registered in `server/src/ai/index.ts`; provider failures must degrade to `{ available: false }`, never fail the report request.
- Validate external and AI data with Zod. `server/src/ai/providers/anthropicProvider.ts` parses model output through `aiAssessmentSchema`; write paths are also documented as Zod-validated in `README.md`.
- Preserve the API response envelope: successful responses use `{ success: true, data }`; errors use `{ success: false, message, error? }`. Client parsing is centralized in `client/src/lib/api.ts`.
- Use `api.get/post/patch/delete` or `request()` in the client rather than calling `fetch` ad hoc; the wrapper always sends cookie credentials and normalizes API errors.
- Client imports should use the `@/*` alias configured in `client/tsconfig.json` and `client/vite.config.ts`.
- Use semantic Tailwind color tokens rather than raw emergency colors. `client/vite.config.ts` distinguishes `severity-*` colors from `destructive`, which is reserved for irreversible actions.
- Maintain domain enum spellings exactly, such as `LOW | MODERATE | HIGH | CRITICAL` and the incident statuses in `client/src/lib/types.ts`.

## Intentional non-standard choices

- `client/src/main.tsx` currently contains the landing page and static dashboard mockup in the entry point; README states the client is not yet fully built, so missing dashboard/login routes are deliberate.
- AI is optional and deliberately non-fatal. Missing configuration, provider errors, refusals, malformed JSON, and schema failures should leave the deterministic result available.
- `server/src/ai/providers/anthropicProvider.ts` tolerates fenced or prose-wrapped JSON via `extractJson`; this is defensive handling of model formatting, not permission to accept unvalidated output.
- The Vite Tailwind configuration is intentionally inline rather than in `tailwind.config.js`, as documented in `client/vite.config.ts`.

## Watch out for

- Any change that lets AI severity override, replace, or delay persistence of the deterministic assessment.
- Sending unbounded report text, raw documents, secrets, or unrelated database fields to the AI layer; prompt inputs are intentionally length-capped in `server/src/ai/prompt.ts`.
- Bypassing `aiAssessmentSchema`, API envelopes, authentication/RBAC, upload validation, or server-side lifecycle transition checks.
- Adding client-side role/status assumptions without matching server enforcement.
- Using `destructive` styling for HIGH/CRITICAL incident severity; severity colors are intentionally separate.
- Treating `Main.java` as part of the TypeScript/npm application; it is an isolated sample program and is not included by the configured workspaces or TypeScript builds.