# TiffinFlow

TiffinFlow is a lightweight full-stack MVP for managing a tiffin subscription business.
It lets an owner register, track customers, pause or resume plans, and calculate accurate
monthly bills based on the weekdays actually served.

## Features

- Owner authentication with JWT-based login and registration
- Customer lifecycle management with search, sorting, pagination, and status tracking
- Pause/resume flows for travel, festivals, or temporary breaks
- Prorated billing that factors in subscription start dates and pause windows
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

## API highlights

- POST /api/auth/register
- POST /api/auth/login
- GET /api/customers
- POST /api/customers
- GET /api/customers/:id
- POST /api/customers/:id/pause
- POST /api/customers/:id/resume
- GET /api/customers/:id/bill

## Billing logic

The billing service calculates a customer bill by:

- counting valid weekdays in the month
- subtracting weekdays covered by pause periods
- excluding dates before the subscription start date
- preventing double-counting when pauses overlap

## Verification

The project is validated with:

- backend test suite: npm test -- --test-concurrency=1
- frontend lint: npm run lint
- frontend production build: npm run build

## Notes

This is an MVP focused on reliability and operational clarity rather than a large-scale marketplace or payment integration.
