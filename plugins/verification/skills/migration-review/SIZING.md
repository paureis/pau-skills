# Sizing, run-time estimates and monitoring

Every query here is read-only. Run them against production only with the user's explicit permission for that
connection, preferably on a read replica; otherwise give them to the user and ask for the output. Row counts from
statistics are estimates, which is what you want: `SELECT count(*)` on a large table is itself a full scan.

## PostgreSQL

Version:
```sql
SHOW server_version;
```

Rows, size and index size for the tables a migration touches:
```sql
SELECT n.nspname AS schema, c.relname AS table_name,
       c.reltuples::bigint AS est_rows,
       pg_size_pretty(pg_relation_size(c.oid))       AS heap,
       pg_size_pretty(pg_indexes_size(c.oid))        AS indexes,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') AND c.relname IN ('orders', 'customers')
ORDER BY pg_total_relation_size(c.oid) DESC;
```
`reltuples` is `-1` for a table never analyzed; use `pg_stat_user_tables.n_live_tup` or run `ANALYZE` on a copy.

Write activity since the statistics were last reset (sample twice, a minute apart, to get a rate):
```sql
SELECT relname, n_live_tup, n_tup_ins, n_tup_upd, n_tup_del, last_autovacuum
FROM pg_stat_user_tables WHERE relname IN ('orders', 'customers');
```

Long-running transactions, which an `ACCESS EXCLUSIVE` request would queue behind:
```sql
SELECT pid, now() - xact_start AS xact_age, state, left(query, 80) AS query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL AND now() - xact_start > interval '30 seconds'
ORDER BY xact_start;
```

Who is blocking whom, during the run:
```sql
SELECT a.pid, pg_blocking_pids(a.pid) AS blocked_by, a.wait_event_type, now() - a.query_start AS waiting,
       left(a.query, 80) AS query
FROM pg_stat_activity a WHERE cardinality(pg_blocking_pids(a.pid)) > 0;
```

Progress of a running index build (12+), and replica lag:
```sql
SELECT phase, blocks_done, blocks_total, tuples_done, tuples_total FROM pg_stat_progress_create_index;
SELECT client_addr, state, replay_lag FROM pg_stat_replication;
```

Free disk is not visible from SQL on most managed services; check the provider's metrics. A rewrite needs about the
table's total size free, plus WAL.

## MySQL

Version and mode:
```sql
SELECT VERSION(), @@sql_mode, @@innodb_default_row_format;
```

Rows and size:
```sql
SELECT table_schema, table_name, table_rows AS est_rows,
       ROUND(data_length / 1024 / 1024)  AS data_mb,
       ROUND(index_length / 1024 / 1024) AS index_mb
FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('orders', 'customers');
```
`table_rows` can be off by a large factor for InnoDB. Treat it as an order of magnitude.

Long-running transactions, which hold metadata locks a DDL would wait on:
```sql
SELECT trx_mysql_thread_id, trx_started, TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS age_s, LEFT(trx_query, 80)
FROM information_schema.innodb_trx ORDER BY trx_started;
```

During the run, metadata lock waits and DDL progress:
```sql
SELECT object_name, lock_type, lock_status, owner_thread_id
FROM performance_schema.metadata_locks WHERE object_name IN ('orders');
SHOW PROCESSLIST;   -- look for "Waiting for table metadata lock"
SELECT event_name, work_completed, work_estimated FROM performance_schema.events_stages_current;
```
Stage progress needs the `stage/innodb/alter%` instruments enabled. Replica lag: `SHOW REPLICA STATUS` (8.0.22+) or
`SHOW SLAVE STATUS`, field `Seconds_Behind_Source` / `Seconds_Behind_Master`.

## SQL Server

```sql
SELECT @@VERSION;
SELECT t.name, SUM(p.row_count) AS est_rows, SUM(p.reserved_page_count) * 8 / 1024 AS reserved_mb
FROM sys.dm_db_partition_stats p JOIN sys.tables t ON t.object_id = p.object_id
WHERE p.index_id IN (0, 1) AND t.name IN ('orders') GROUP BY t.name;
```
Blocking during the run: `sys.dm_exec_requests` where `blocking_session_id <> 0`.

## SQLite

`SELECT count(*) FROM t;` is acceptable on small files. The file size is the database size. With the `dbstat`
virtual table compiled in: `SELECT name, SUM(pgsize) FROM dbstat GROUP BY name ORDER BY 2 DESC;`.

## Estimating run time

The only reliable number is one measured on a copy with production-like volume, on similar hardware. When that is
not available:

1. Time the statement on a local or disposable database loaded with synthetic rows of realistic width, ideally at
   least a few percent of production size.
   ```sql
   -- PostgreSQL: one million rows
   INSERT INTO orders (customer_id, amount, created_at)
   SELECT (random() * 100000)::int, (random() * 1000)::numeric(10,2), now() - random() * interval '3 years'
   FROM generate_series(1, 1000000);
   ```
   MySQL 8 has no `generate_series`; use a recursive CTE (raise `cte_max_recursion_depth`) or insert-select doubling.
2. Scale linearly for rewrites, scans, copies and backfills; slightly more than linearly for index builds (sorting).
   Add a margin for production load and slower or throttled storage: a factor of two to five is a reasonable planning
   range, not a promise.
3. Convert the estimate into what users feel: how long writes (or reads) are blocked, and how far replicas fall
   behind. A one-minute `ACCESS EXCLUSIVE` on a table every request reads is a one-minute outage.

As a rough guide to "large": any statement that holds a blocking lock while scanning or rewriting is harmless under
about a hundred thousand narrow rows and needs a safe alternative somewhere in the millions, but the deciding number
is the measured lock duration compared with the application's request timeout.

## The run itself

Put this in the run plan in the report:

- Who runs it, from where, and when (low-traffic window if anything blocks).
- Session timeouts set (LOCKS.md) and what happens on timeout: retry how many times, then stop.
- What to watch while it runs: lock waits and blocked sessions (queries above), application error rate and latency,
  replica lag, CPU and I/O, disk free.
- Abort condition, decided in advance: for example "blocked sessions over 20 or replica lag over 60 seconds: cancel"
  (`SELECT pg_cancel_backend(pid)` on PostgreSQL, `KILL QUERY id` on MySQL, or gh-ost's pause and abort commands).
  On MySQL, a cancelled COPY alter rolls back, which can take as long as it ran.
- Backup or snapshot confirmed recent enough before any destructive step, and the restore time known.
