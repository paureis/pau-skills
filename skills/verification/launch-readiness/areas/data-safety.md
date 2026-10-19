# Area: data safety

Load when the app stores data its users would miss. For an app that stores nothing, write one row `SAFE-NA` (n/a,
"stores no user data"). Most of these cannot be seen in code: they are questionnaire items (`QUESTIONNAIRE.md`)
stored as `answer` rows with an expiry.

**SAFE-01 Automatic backups** (1, must-fix). Applies: any database or file store with user data. Check: the
provider's backup setting or a scheduled dump, its frequency and how long backups are kept, stored in another
account or region than the data. Pass: `file:line` of infrastructure code that sets it, or an `answer` row (expiry
12 months). Fix: a setting; small.

**SAFE-02 A restore that was tested** (2, must-fix). Applies: SAFE-01 applies. A backup nobody has restored is a
hope. Check: when a restore was last done into a fresh database, how long it took and what was checked after.
Questionnaire item `restore-tested`, expiry 12 months. Fix: do one; bigger, needs DevOps time.

**SAFE-03 Point-in-time recovery** (2, can-wait; 3, must-fix). Applies: a database where losing a day of writes
hurts (orders, payments, messages). Check: PITR on, and its window. Pass: infrastructure code or an `answer` row.

**SAFE-04 Soft deletes or an undo for user-facing deletes** (2, can-wait). Applies: users can delete things they
may want back. Check: a deleted flag or trash with a purge after a stated time, so a mistake can be undone; hard
delete still happens for account deletion (CMP-04).

**SAFE-05 Retention rules** (3, must-fix; 4, must-fix for regulated data). Applies: personal data, logs, backups.
Check: how long each kind is kept and a job that deletes it after, including backups and log stores. Pass: the
policy in the repository plus `file:line` of the job.

**SAFE-06 Destructive operations guarded** (1, must-fix). Applies: admin tools, scripts and migrations that delete.
Check: no "delete all" endpoint reachable in production, scripts ask for the environment name, production
credentials are not on developer laptops by default.

**SAFE-07 Files and object storage** (2, must-fix). Applies: uploads or generated files. Check: private buckets by
default, signed URLs with an expiry, versioning or backups on the bucket, and a lifecycle rule for old files.
