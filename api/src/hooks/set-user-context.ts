// RLS user context is now set inside withTransaction() in db/pool.ts.
// This hook was removed because set_config must run on the same DB connection
// that executes the business logic — a separate hook connection is useless for RLS.
// See CRIT-1 fix in the code review.
