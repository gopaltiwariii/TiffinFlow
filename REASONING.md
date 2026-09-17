# TiffinFlow — Reasoning

## 1. Understanding the Problem

TiffinFlow is designed for a home-style tiffin service where customers subscribe to a monthly lunch plan and receive lunch on weekdays.

The main requirement is to ensure that customers are billed only for the days on which they were actually served.

The core workflow is:

1. Register/login as the tiffin owner.
2. Add a customer with their phone number, monthly plan price, and subscription start date.
3. Pause service for a customer for a date range.
4. Resume service when the customer returns.
5. Calculate the customer's bill for a selected month based on the weekdays actually served.
6. Search customers by name or phone number.
7. View active and paused customer status.

The billing and pause/resume workflow was treated as the primary requirement before the lookup and dashboard features.

## 2. Technology Choice

The application uses:

- React + Vite for the frontend
- Node.js + Express for the backend
- SQLite with better-sqlite3 for persistent storage
- JWT for authentication
- bcryptjs for password hashing

This stack was chosen because it is lightweight, quick to develop, and appropriate for the Builder challenge while still providing a real persistent database and REST API architecture.

## 3. Database Design

The database contains three main tables:

### users

Stores owner authentication information including the password hash.

### customers

Stores:

- Customer name
- Phone number
- Monthly plan price
- Subscription start date
- Customer status
- Creation/update timestamps

The phone number is unique so that the same customer cannot accidentally be registered multiple times with the same phone number.

### pause_periods

Stores:

- Customer ID
- Pause start date
- Pause end date
- Optional pause reason
- Creation timestamp

Pause periods are stored separately rather than keeping only a single pause flag. This allows historical pauses to be used when calculating monthly bills.

Foreign keys and database constraints are used to maintain data integrity.

Indexes are included for frequently used customer and pause lookups.

## 4. Billing Approach

The billing calculation is performed by the backend so that the business rule is not dependent on frontend calculations.

For a selected month:

1. Determine the month's weekdays from Monday through Friday.
2. Apply the customer's subscription start date.
3. Find pause periods that overlap the billing period.
4. Count only paused weekdays.
5. Deduplicate dates when pause periods overlap.
6. Calculate the number of delivered weekdays.
7. Calculate the proportional monthly bill.

The basic calculation is:

`Bill = Monthly Plan Price × Delivered Weekdays / Billable Weekdays`

Monetary calculations are handled internally using integer paise/cents to avoid normal floating-point money errors.

## 5. Important Billing Edge Cases

The implementation considers:

- Weekends
- Subscription starting in the middle of a month
- Pause periods crossing month boundaries
- Multiple pause periods
- Overlapping pause periods
- Invalid pause ranges
- Invalid plan prices
- Months with no billable weekdays

Overlapping pause periods are deduplicated so the same weekday is not counted as paused more than once.

## 6. REST API Design

The backend exposes REST APIs for the main application operations:

- Registration
- Login
- Customer creation
- Customer listing
- Customer search
- Customer details
- Customer pause
- Customer resume
- Customer status
- Monthly billing

Protected customer APIs require authentication.

Customer listing supports search, pagination, and sorting.

Sortable database fields are restricted through an allowlist rather than accepting arbitrary SQL column names.

## 7. Authentication and Security

Passwords are hashed using bcryptjs rather than being stored directly.

JWT tokens are used to authenticate protected API requests.

The backend verifies the token and also checks that the corresponding user still exists.

SQL queries use parameterized values for user-provided search and customer data.

The database uses foreign-key enforcement.

The JWT secret is configurable through environment variables, and production execution requires an explicitly configured JWT secret.

Environment files containing secrets are excluded from version control.

## 8. Frontend Design

The frontend provides:

- Landing page
- Registration
- Login
- Owner dashboard
- Customer creation
- Customer search
- Pagination
- Sorting
- Customer details
- Pause/resume controls
- Monthly billing information

The UI is intentionally focused on a tiffin owner's workflow rather than trying to replicate a large food-delivery platform.

The landing page explains what the product does, its key features, target users, how it helps, and possible future features.

## 9. Testing and Verification

The backend contains automated tests covering billing calculations and API behavior.

The billing tests cover:

- Full monthly billing
- Pro-rated billing after pauses
- Weekend handling
- Multiple pause periods
- Overlapping pauses
- Month-boundary pauses
- Mid-month subscriptions
- Invalid pause ranges
- Invalid prices

API tests cover:

- Duplicate phone rejection
- Unauthorized requests
- Invalid JWT handling
- Search
- Pagination
- Sorting
- Pause/resume flows

Final verification performed during development:

- Backend: 16 tests passed, 0 failed
- Frontend lint: passed
- Frontend production build: succeeded

## 10. Debugging and Fixing

The implementation was developed iteratively with AI assistance.

Testing was used to identify implementation problems rather than changing expected test results to make failures disappear.

After fixes were applied, the backend test suite and frontend production build were executed again to verify the implementation.

## 11. Scalability Considerations

The application uses:

- Database indexes for frequently queried fields
- Parameterized SQL queries
- Pagination instead of loading the complete customer list into the UI
- Backend-side sorting
- Backend-side search
- SQLite WAL mode
- Foreign-key enforcement

The customer list count uses an aggregate database count rather than depending on the number of records displayed on the current page.

For a much larger production deployment, the database could be migrated to PostgreSQL and additional operational infrastructure could be introduced.

## 12. Notifications and Outbox Design

The daily delivery requirement was modeled as a real backend notification workflow, not a frontend mock.

A Notification Service abstraction handles the decision to send a delivery reminder for a customer on a target business date. The service checks:

- the subscription has started
- the current date is a weekday
- the customer is not paused
- the customer is still active for that date
- the same customer/date combination has not already been recorded in the outbox

The generated events are persisted in SQLite so the evaluator can verify them through the outbox API. This keeps the service logically separated from the customer and billing routes and makes it easy to swap in WhatsApp, SMS, or email providers later.

## 13. Subscription Transfer Design

A simple customer name swap was rejected because it would lose the original subscription context. Instead, transfer history is stored as a first-class table that preserves:

- the old customer
- the new customer
- the effective transfer date
- the subscription cycle identifier
- creation timestamps

This preserves auditable ownership history and allows the same monthly cycle to remain consistent even when ownership changes mid-cycle. Billing then splits attribution by service window rather than by resetting or duplicating the monthly plan.

## 14. CSV Import Design

The import workflow treats messy customer lists as a trusted-data problem rather than a data-entry shortcut.

The implementation normalizes the phone and date inputs, rejects blank or broken rows, checks duplicates both within the import and against the database, and wraps valid inserts in a transaction so a partial import cannot leave the database corrupted.

The response includes a report object with imported, deduped, rejected, and row-level detail counts so the owner can review the outcome without needing a spreadsheet or external tool.

## 15. Known Limitations

This is an MVP designed for the Builder challenge rather than a complete production billing platform.

Current limitations include:

- No payment integration
- No SMS/email notification system
- No advanced analytics
- No full multi-tenant access-management model
- Simple date-driven pause/resume workflow
- Production deployment configuration would require environment-specific configuration

## 13. Future Improvements

Potential next features listed for the product include:

1. Online payments
2. WhatsApp delivery notifications
3. Revenue analytics

Additional production improvements could include stronger multi-tenant isolation, audit logs, automated backups, and a production relational database.