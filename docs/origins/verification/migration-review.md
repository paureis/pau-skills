# migration-review (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Migrations are usually reviewed only for whether the SQL is valid. What goes wrong in production is what
a valid statement does to a large table on a given engine version while the old code is still running: a lock that
queues behind one long transaction and blocks every query, a column rename that breaks the running release, a
single-statement backfill that floods the replicas, or a down migration that restores the columns but not the data.
Agents tend to approve these because they pass on an empty local database. The PostgreSQL rewrite and lock claims
were checked against a throwaway PostgreSQL 16 cluster; the MySQL and SQL Server notes come from documentation.

**Changes for this release.** None; written for this release.
