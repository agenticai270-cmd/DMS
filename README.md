# RESQ — AI-Powered Disaster Assessment & Emergency Response System

RESQ is an emergency-management platform. People report disasters from the field; a
deterministic assessment engine scores each incident for severity, identifies risk
factors and recommends resources and actions; coordinators verify, assign and track
the response from an admin console.

The core flow the product is built around:

```
USER REPORT → ASSESSMENT → SEVERITY → RISK FACTORS → RECOMMENDED RESPONSE
            → EMERGENCY RESOURCES → ADMIN COORDINATION → INCIDENT TRACKING
```

---

## Current status

| Area | State |
|---|---|
| Backend API (Express + MongoDB + TypeScript) | Implemented |
| Deterministic assessment engine | Implemented, 23 passing tests |
| AI assessment layer (Anthropic, optional) | Implemented |
| Auth, RBAC, validation, rate limiting, uploads | Implemented |
| Demo seed data (incidents, resources, guides, alerts) | Implemented |
| React client | **Not yet built** — `client/` holds only its manifest |

The API is runnable and seedable today. Until the client exists, exercise the
backend with `curl`, Postman, or the Thunder Client / REST Client VS Code extension.

---

## Quick start

```bash
# 1. Install everything (npm workspaces — run from the repo root)
npm install

# 2. Create the server env file
cp .env.example server/.env
#    Then edit server/.env and set a real JWT_SECRET.

# 3. Load demo data (also creates the admin + demo accounts)
npm run seed

# 4. Start the API
npm run dev:server        # http://localhost:5000
```

### Do I need MongoDB installed?

No. If `MONGODB_URI` is unreachable, the server downloads and starts a bundled
`mongod` writing to `server/.local-db/`, so seeded data survives restarts. The
first run downloads ~600 MB and takes a couple of minutes; later runs are instant.
This fallback is disabled in production — there, an unreachable database is a
hard failure.

To use your own MongoDB instead, point `MONGODB_URI` at it and the fallback never
activates.

### Development sign-in

Created by `npm run seed`, configurable via `SEED_*` variables in `server/.env`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@resq.io` | `Admin@12345` |
| User | `demo@resq.io` | `Demo@12345` |

These are development credentials. Change `SEED_ADMIN_PASSWORD` before running the
seed anywhere that is not your own machine, and never run the seed against production.

---

## Scripts

Run from the repo root:

| Command | What it does |
|---|---|
| `npm run dev:server` | API with hot reload on :5000 |
| `npm run dev:client` | Vite dev server on :5173 (once the client exists) |
| `npm run dev` | Both together |
| `npm run seed` | Reset and reload demo data |
| `npm test` | Run the server test suite |
| `npm run typecheck` | Typecheck every workspace |
| `npm run build` | Compile server, then build client |

---

## Architecture

```
resq/
├── client/                      # React + TypeScript + Vite (not yet built)
├── server/
│   └── src/
│       ├── analyzers/           # Deterministic assessment engine + its config
│       ├── ai/                  # Provider-agnostic AI layer (+ Anthropic impl)
│       ├── config/              # env parsing, database connection
│       ├── controllers/         # Thin HTTP handlers
│       ├── middleware/          # auth, validation, uploads, errors, rate limits
│       ├── models/              # Mongoose schemas
│       ├── routes/              # Route tables
│       ├── seed/                # Demo dataset + safety guides + seed script
│       ├── services/            # Business logic (assessment, reports, stats…)
│       ├── types/               # Shared domain enums and lifecycle rules
│       ├── utils/               # Response envelope, geo, logging, ids
│       └── validators/          # Zod schemas
└── .env.example
```

Business logic lives in `services/` and `analyzers/`, not in controllers. Controllers
parse input, call a service, and return a response.

### The assessment engine

`server/src/analyzers/disasterAssessment.ts` is the heart of the system and is
deliberately **not** AI-driven. It scores every incident 0–100 from five
independently-weighted factors:

| Factor | Max points | Basis |
|---|---|---|
| Disaster type | 18 | Intrinsic hazard index per type |
| Reported urgency | 26 | Reporter's urgency selection |
| People affected | 24 | Non-linear population bands |
| Situation indicators | 24 | Regex signals mined from the description |
| Response context | 8 | Night-time, imprecise location, thin detail |

Score bands: `0–25 LOW`, `26–50 MODERATE`, `51–75 HIGH`, `76–100 CRITICAL`.

Every weight, hazard index, population band, keyword signal and threshold lives in
`analyzers/assessmentConfig.ts`, so the model can be retuned per region without
touching the algorithm. The engine returns the severity, score, a per-factor
breakdown (so the UI can explain *why* a score landed where it did), risk factors,
recommended resources and recommended actions.

It is pure and deterministic: identical input always yields identical output, and
it needs no database and no network. That is what the test suite pins down.

### The AI layer is strictly additive

After the deterministic assessment is computed and stored, the AI layer may add a
narrative summary, key risks, immediate actions, resource suggestions and safety
guidance. It is wrapped so that **no AI failure can break a request**:

- Missing `AI_API_KEY` → the layer is skipped entirely.
- API error, timeout, refusal, malformed JSON, or a response failing Zod validation
  → caught, logged, and stored as `ai.available = false` with the reason.
- The deterministic assessment is persisted and returned either way, and the UI is
  expected to show "AI insights unavailable".

Only structured, length-capped fields are sent to the model — never raw documents
or unbounded content. Swapping providers means implementing the `AiProvider`
interface in `ai/types.ts` and registering it in `ai/index.ts`.

AI output here is decision support for a trained coordinator. It does not replace
emergency services or professional responders, and the system prompt says so.

---

## API

All responses share one envelope:

```jsonc
// success
{ "success": true, "data": { /* ... */ } }

// error
{ "success": false, "message": "Human-readable message", "error": { /* details */ } }
```

Authentication is a JWT, sent either as `Authorization: Bearer <token>` or via the
`resq_token` httpOnly cookie set at login.

### Routes

| Method | Path | Access |
|---|---|---|
| `POST` | `/api/auth/register` | public |
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/logout` | public |
| `GET` | `/api/auth/me` | auth |
| `PATCH` | `/api/auth/profile` | auth |
| `PATCH` | `/api/auth/password` | auth |
| `GET` | `/api/dashboard` | auth |
| `POST` | `/api/reports` | auth (multipart, optional `image`) |
| `GET` | `/api/reports` | auth (own reports; admin sees all) |
| `GET` | `/api/reports/:id` | auth (own) / admin |
| `GET` | `/api/reports/:id/assessment` | auth (own) / admin |
| `GET` | `/api/reports/map` | admin |
| `POST` | `/api/reports/:id/assess` | admin |
| `PATCH` | `/api/reports/:id/status` | admin |
| `PATCH` | `/api/reports/:id/resources` | admin |
| `DELETE` | `/api/reports/:id` | admin |
| `GET` | `/api/resources`, `/api/resources/:id` | auth |
| `POST` `PATCH` `DELETE` | `/api/resources…` | admin |
| `GET` | `/api/emergency-info`, `/api/emergency-info/:id` | auth |
| `POST` `PATCH` `DELETE` | `/api/emergency-info…` | admin |
| `GET` | `/api/alerts` | auth |
| `PATCH` | `/api/alerts/read-all`, `/api/alerts/:id/read` | auth |
| `GET` | `/api/alerts/admin/all` | admin |
| `POST` `DELETE` | `/api/alerts…` | admin |
| `GET` | `/api/admin/stats`, `/analytics`, `/incidents`, `/users` | admin |
| `PATCH` | `/api/admin/users/:id` | admin |
| `GET` | `/api/health`, `/api/system/status` | public |

### Incident lifecycle

Status transitions are enforced server-side; an illegal move is rejected with a 400.

```
SUBMITTED ──→ UNDER_REVIEW ──→ VERIFIED ──→ RESPONSE_ASSIGNED ──→ IN_PROGRESS ──→ RESOLVED
     │              │              │
     └──────────────┴──────────────┴──→ REJECTED
```

Every transition appends an `IncidentTimeline` entry recording the status, actor,
timestamp and an optional note, and notifies the reporter.

### Try it

```bash
# Sign in as the seeded admin
curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@resq.io","password":"Admin@12345"}'

# Use the returned token
TOKEN=...
curl -s http://localhost:5000/api/admin/stats -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:5000/api/reports?limit=5" -H "Authorization: Bearer $TOKEN"
```

---

## Data model

Seven collections, no more:

- **User** — name, email, bcrypt password hash, role (`user` | `admin`), active flag
- **DisasterReport** — the field report, plus denormalised severity for fast lists/maps
- **DisasterAssessment** — one per report: score, per-factor breakdown, risks,
  recommendations, and the optional AI block
- **EmergencyResource** — hospitals, ambulances, shelters, rescue teams… with capacity
  and live availability
- **EmergencyInformation** — before/during/after safety guides per disaster type
- **Notification** — broadcast alerts and personal status notifications
- **IncidentTimeline** — append-only audit trail per incident

---

## Security

- bcrypt password hashing (cost 12); password never selected by default
- JWT auth with role-based route guards; `role` is never read from a request body,
  so self-registration cannot escalate to admin
- Zod validation on every write path — no client input is trusted
- Helmet, CORS allow-list, and tiered rate limits (global / auth / report submission)
- Upload validation: MIME allow-list (JPG/PNG/WebP), size cap, server-generated
  filenames, `X-Content-Type-Options: nosniff` on served files
- Login failures return one message for both unknown-email and wrong-password, so
  the endpoint cannot enumerate accounts
- The last active administrator cannot be demoted or deactivated
- `JWT_SECRET` shorter than 16 characters is a startup error in production
- Stack traces are returned only outside production

Secrets live in `server/.env`, which is gitignored. `.env.example` documents every
variable and contains no real values.

---

## Environment variables

See [`.env.example`](.env.example) for the annotated list. The ones that matter:

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `5000` | API port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/resq` | Falls back to bundled mongod in dev |
| `JWT_SECRET` | — | **Required in production**, min 16 chars |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allow-list (comma-separated) |
| `AI_API_KEY` | — | Optional. Empty = deterministic engine only |
| `AI_MODEL` | `claude-opus-5` | Model id for the AI layer |
| `MAX_UPLOAD_MB` | `5` | Per-image upload cap |

---

## Testing

```bash
npm test                              # from the repo root
npm test --workspace server           # or scoped to the server
```

The current suite (`server/tests/disasterAssessment.test.ts`, 23 tests) covers the
assessment engine: severity band boundaries and clamping, monotonicity across
urgency and population, hazard-type weighting, the breakdown summing to the total,
the 100-point ceiling, signal detection and explicit flags, context risk factors,
deduplication, severity-driven escalation, determinism, config overridability, and
`NaN` input handling.

Integration tests for the auth/report/assessment APIs and E2E coverage of the
reporting and admin flows are not written yet.

---

## Demo mode

`npm run seed` loads a realistic dataset centred on Patiala, Punjab:

- 10 incidents across flood, fire, storm, earthquake, medical, heatwave, landslide,
  industrial accident and cyclone — spread over the past five days, at different
  lifecycle stages, each with a real assessment and a believable timeline
- 19 emergency resources with live capacity/availability and mixed statuses
- 7 before/during/after safety guides
- 4 broadcast alerts

Every seeded record carries `isDemo: true`, so demo data is always distinguishable
from anything a real user submits, and re-seeding only clears demo records. The
`/api/system/status` endpoint reports whether the dataset is demo-only, whether the
AI layer is configured, and whether the bundled database is in use.

Seeded assessments are computed by the deterministic engine only — seeding never
makes a network call, so it works offline and costs nothing.
