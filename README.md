# TiffinFlow

TiffinFlow is a lightweight full-stack MVP for managing a tiffin subscription business.
It lets an owner register, track customers, pause or resume plans, and calculate accurate
monthly bills based on the weekdays actually served.

## Features

- Owner authentication with JWT-based login and registration
- Customer lifecycle management with search, sorting, pagination, and status tracking
- Pause/resume flows for travel, festivals, or temporary breaks
- Prorated billing that factors in subscription start dates and pause windows
- Daily delivery notifications through a persistent outbox pattern
- Mid-cycle subscription transfer tracking with historical ownership records
- CSV import workflow for messy customer lists with dedupe and rejection reporting
- Responsive owner dashboard for day-to-day operations

## Stack

- Backend: Node.js + Express + SQLite
- Frontend: React + Vite
- Auth: JWT + bcrypt password hashing

## Setup

1. Copy the sample environment file:
   cp .env.example .env
2. Update the values in the root environment file with your local configuration.
3. Install dependencies for both apps:
   cd backend && npm install
   cd ../frontend && npm install
4. Start the backend:
   cd ../backend && npm run dev
5. Start the frontend:
   cd ../frontend && npm run dev

## Environment variables

- PORT: backend listen port, default 4000
- JWT_SECRET: strong secret required for non-test environments
- DB_PATH: SQLite database path, default backend/data/tiffinflow.db
- VITE_API_URL: frontend API origin used for browser requests; defaults to http://localhost:4000 and must point to the forwarded backend URL in GitHub Codespaces

For GitHub Codespaces, the frontend resolves the backend by reading the forwarded port hostname pattern automatically when `VITE_API_URL` is not set. Local development can still use the default `http://localhost:4000`.

## API highlights

- POST /api/auth/register
- POST /api/auth/login
- GET /api/customers
- POST /api/customers
- POST /api/customers/import
- GET /api/customers/:id
- POST /api/customers/:id/pause
- POST /api/customers/:id/resume
- POST /api/customers/:id/transfer
- GET /api/customers/:id/transfers
- GET /api/customers/:id/bill
- POST /api/clock
- GET /api/outbox

## Billing logic

The billing service calculates a customer bill by:

- counting valid weekdays in the month
- subtracting weekdays covered by pause periods
- excluding dates before the subscription start date
- preventing double-counting when pauses overlap
- preserving the original monthly cycle when a subscription is transferred mid-month

## Daily notification workflow

The daily clock endpoint is implemented as a backend workflow that evaluates a business date, finds eligible active subscriptions, ignores weekends and paused customers, and writes notification records to a persistent outbox table.

- POST /api/clock: processes a business date and creates delivery notifications for eligible customers
- GET /api/outbox: returns the generated notification rows for verification
- Duplicate notifications are blocked with a unique constraint keyed to customer and delivery date
- Notification payloads include enough data to identify the customer and date of the delivery

## Transfer workflow

Subscriptions can be transferred to a new customer while preserving the existing monthly plan and cycle.

- Transfer records keep the old customer, new customer, effective date, cycle identifier, and timestamps
- The effective transfer date is treated as the first service day for the new customer
- Billing is split by the service attribution windows before and after the transfer date
- Historical transfer records remain auditable and are exposed through GET /api/customers/:id/transfers

## CSV import workflow

Owners can upload CSV files with messy data and receive a validation report.

- Supported date formats include YYYY-MM-DD, DD/MM/YYYY, and DD-MM-YYYY
- Ambiguous dates are rejected instead of guessed
- Phone numbers are normalized with the same validation rules used for customer creation
- Duplicate numbers within the CSV and duplicate existing database records are either deduped or rejected with clear reasons
- Valid rows are inserted inside a transaction, and the response includes imported, deduped, rejected, and detail-level reporting

## Verification

The project is validated with:

- backend test suite: npm test -- --test-concurrency=1
- frontend lint: npm run lint
- frontend production build: npm run build

## Notes

This is an MVP focused on reliability and operational clarity rather than a large-scale marketplace or payment integration.
