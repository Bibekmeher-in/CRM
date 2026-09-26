# SmartCRM AI

A compact full-stack CRM for managing customer relationships, tracking deals, and drafting thoughtful sales follow-ups.

## Features

- Email/password signup and login with bcrypt-hashed passwords and a signed, HTTP-only session cookie.
- User-scoped contact and deal CRUD, contact search, contact details, and duplicate-email validation.
- Five-stage Kanban pipeline with drag-and-drop stage updates persisted through the API.
- Dashboard totals, open pipeline and won revenue, recent activity, and stage distribution.
- Server-side AI follow-up generation with an editable, copyable email draft and a local fallback template.
- Optional realistic sample contacts and deals, responsive navigation, loading/empty/error states, and delete confirmations.

## Tech Stack

- Next.js App Router and TypeScript
- React and Tailwind CSS
- MongoDB and Mongoose
- bcryptjs and JSON Web Token for password hashing and sessions
- OpenAI Chat Completions API for optional AI email generation
- lucide-react icons

## Architecture

The UI is a client-side CRM workspace in `src/components/crm-app.tsx`. It calls REST-style route handlers under `src/app/api`. Route handlers authenticate from the HTTP-only session cookie, derive the owner ID from its verified token, and scope database reads and writes to that ID. MongoDB access and model definitions are shared in `src/lib`.

```text
Browser UI
  └── Next.js route handlers (/api/*)
        ├── Signed session cookie -> User
        ├── Mongoose -> MongoDB
        └── Server-only OpenAI request -> email draft
```

## Database Schema

- **User**: name, unique email, password hash, timestamps.
- **Contact**: owner (`userId`), name, email, phone, company, job title, notes, timestamps. Email is unique per user.
- **Deal**: owner (`userId`), referenced contact (`contactId`), title, company, value, stage, notes, timestamps. Stages are `New`, `Contacted`, `Qualified`, `Won`, and `Lost`.

Deals are checked against the authenticated user's contacts before creation or reassignment. Deleting a contact also removes its deals.

## API Structure

All CRM and AI endpoints require an authenticated session. Request bodies are JSON; errors return an `error` message and an appropriate HTTP status.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth` | Read the current session |
| `POST` | `/api/auth` | Sign up (`mode: "signup"`) or sign in |
| `DELETE` | `/api/auth` | Sign out |
| `GET`, `POST` | `/api/contacts` | Search/list contacts (`?q=`) or create |
| `GET`, `PATCH`, `DELETE` | `/api/contacts/:id` | Read, edit, or delete a contact |
| `GET`, `POST` | `/api/deals` | List or create deals |
| `PATCH`, `DELETE` | `/api/deals/:id` | Update a deal, including stage, or delete |
| `GET` | `/api/dashboard` | Dashboard statistics and recent records |
| `POST` | `/api/ai/email` | Generate a follow-up for `{ "dealId": "..." }` |
| `POST` | `/api/demo` | Add sample records to an empty workspace |

## Environment Variables

Copy `.env.example` to `.env.local` and set the MongoDB URI and a private session secret. A local MongoDB instance or MongoDB Atlas database can be used.

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `SESSION_SECRET` | Yes | Private signing secret for session tokens; use a random value of at least 32 characters |
| `OPENAI_API_KEY` | No | Server-side API key for AI-personalized drafts |
| `OPENAI_MODEL` | No | Chat Completions model; defaults to `gpt-4o-mini` |

Generate a local session secret with Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env.local` or expose `OPENAI_API_KEY` to browser code. Without an AI key, the server returns an editable follow-up template. If the configured AI service returns an error, the endpoint reports it without leaking credentials.

## Installation and Run

Requirements: Node.js 20.9 or newer, npm, and a reachable MongoDB database.

```bash
npm install
# Create .env.local from .env.example and fill in the required values.
npm run dev
```

Open `http://localhost:3000`, create an account, then add contacts and deals or load sample data from **Settings**. Production checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm start
```

## AI Integration

`POST /api/ai/email` loads the requested deal and its contact using the authenticated owner ID. When `OPENAI_API_KEY` exists, the route sends only the relevant contact and opportunity context to the OpenAI Chat Completions API from the server. It requests a concise professional subject and body as JSON. The browser receives the editable draft, never the API key. Without a key, a concise contextual template is returned with `fallback: true`.

## Error Handling

API handlers check authentication and object IDs, validate required values and stage names, scope records to their owner, and return client errors for invalid input, missing records, duplicates, or unauthorized access. Database and upstream AI failures return safe messages without stack traces or secrets. The UI includes retry, empty, loading, and inline/toast error states.

## Security Considerations

- Passwords are stored only as bcrypt hashes.
- Session JWTs are signed with `SESSION_SECRET` and stored in HTTP-only, SameSite=Lax cookies; cookies are secure in production.
- Owner IDs are never accepted from request bodies. Each protected operation scopes queries to the verified session owner.
- Mongoose schemas validate deal stages and non-negative values; route handlers validate input before writes.
- AI credentials remain server-side. Use HTTPS and a strong, private session secret in production.

## Future Improvements

- Add pagination and richer filtering as datasets grow.
- Add email delivery, refreshable sessions, password reset, and account verification.
- Add audit history, team workspaces, role-based access, and automated integration tests.
- Add configurable AI providers and explicit retention controls for prompt context.