# Area: access control and tenancy

Load when the app has accounts, or data that belongs to someone. For an app with no accounts and no per-user data,
write one row `ACC-NA` (n/a, "no accounts or per-user data").

Access control is the gap agents leave most often: the list page filters by owner, and the detail route next to it
does not. Read every route that takes an id, not a sample. Rows marked probe need one (SKILL.md step 5); the probe
is a test in the project's own framework that fails while the gap is there.

**ACC-01 Ownership checked on every record route** (1, must-fix, probe). Applies: any route that reads, changes or
deletes a record by id (REST `/:id`, GraphQL resolvers by id, RPC calls, file downloads by key). Check: for each,
find where the record's owner or tenant is compared with the caller from the session, or the query is scoped
(`where owner_id = current_user`, a policy, a scoped repository). A check that the caller is signed in is not an
ownership check. Probe: sign in as user A, request user B's record by id; expect 403 or 404. Pass: the probe's
output for each route family. Fix: scope the query or add the check; small per route.

**ACC-02 Tenant isolation** (2, must-fix, probe). Applies: more than one customer organization shares the
database. Check: every query on tenant data carries the tenant id from the session (a default scope, a row-level
security policy on Postgres, a schema per tenant), including background jobs, exports, search indexes and caches
(a cache key without the tenant id leaks across tenants). Probe: as tenant A, list, search and export; nothing of
tenant B shows. Fix: medium; it touches every query.

**ACC-03 Roles enforced on the server** (1, must-fix, probe). Applies: more than one role (admin, member, viewer,
owner). Check: each privileged action checks the role on the server; a hidden button is not a check. Probe: call an
admin action as a member. Fix: small per action.

**ACC-04 IDs that cannot be walked** (2, can-wait). Applies: public or shareable URLs with record ids. Sequential
ids make a missing ACC-01 check easy to exploit and leak counts. Pass: UUIDs or random ids, or ACC-01 passed for
every route. Fix: medium (a migration).

**ACC-05 Invites, sharing and removal** (2, must-fix). Applies: users can invite others or share records. Check: an
invite is bound to the email it was sent to and expires; removing a member ends their sessions and API keys; a
shared link can be revoked. Pass: `file:line` of each.

**ACC-06 Mass assignment** (1, must-fix, probe). Applies: handlers that write the request body into a model.
Check: an allowlist of fields; `role`, `ownerId`, `tenantId`, `isAdmin`, `price` and `status` are never taken from
the body. Probe: send `"role": "admin"` on a profile update.

**ACC-07 Audit trail of who did what** (3, must-fix). Applies: enterprise buyers, or stage 4. Check: an append-only
log of sign-ins, permission changes, exports and deletes, with actor, time, target and source address, kept for the
period the buyer asks (often a year), and readable by the customer's admin. Fix: bigger; a brief.

**ACC-08 SSO (SAML or OIDC) and SCIM provisioning** (3, must-fix). Applies: enterprise buyers. Check: a SAML or OIDC
login per organization, enforced SSO, SCIM or another way to deprovision users when they leave the customer. A
hosted provider (WorkOS, Auth0, Okta, Clerk, Cognito) covers most of it. Fix: bigger; a brief.

**ACC-09 Access reviews** (3, must-fix). Who on the team can reach production data, reviewed each quarter.
Questionnaire item `access-review`.
