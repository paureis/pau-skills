# Production rules

Five rules that stop the gaps agents leave most often in code that real users and real money reach. The block between
the two marker lines is pasted word for word into agent files, and its rules are offered one by one for a project's
CLAUDE.md. Each rule starts with its condition, so the block is safe in work on any project: a rule whose condition
does not hold asks for nothing.

The tables after the block say when to offer each rule, which readiness checks it prevents, and which tools can
enforce it. Every copy of this file is identical: change them all in one commit.

<!-- production rules start -->
## Production rules

Each rule applies only when its condition holds. Follow these rules in every change you make. When you check a
change, report a break of one as a defect, with `file:line`.

1. **Money.** When the code stores, adds up or charges money, keep amounts as whole numbers in the smallest unit of
   the currency or in a decimal type, never as a fractional amount in a binary float, and store the currency next to
   the amount. Round once, at one defined step, by one stated rule.
2. **Input.** When the server takes input (a request body, a query string, a header, a form, an upload, a queue
   message), validate it on the server with a schema or explicit checks of type, length and range, and cap its size.
   Checks in the client do not count.
3. **Queries.** When the code builds a database query, pass every value as a bound parameter or through the query
   builder, never by concatenation, interpolation or string formatting, and never pass a request object straight in
   as a filter. Pick a table or column name that comes from input from a fixed list.
4. **The signed-in user.** When a route or action works for a signed-in user, take the user's id and role from the
   server-side session or a verified token, never from a value the client sets, such as a `userId` field or an
   `X-User-Id` header. When it reads, changes or deletes a record that belongs to a user or an organization, check
   that it belongs to the caller or their organization, or scope the query to them. Check the role on the server for
   every privileged action. Copy from the request only the fields a user may set, never the fields the server
   decides, such as the owner, the organization or the role.
5. **Secrets.** When the code needs a secret key, token or password, read it from the environment the code runs in or
   from a secret store. Never write one into the code, a committed config file, or anything sent to a browser or a
   mobile app. A key meant to be public, such as a Stripe `pk_` key, is not a secret. If a secret was ever committed,
   rotate it at the provider, then remove it.
<!-- production rules end -->

## When to offer each rule

Offer a rule when the project shows its signal, in its files or in the goal its owner states. Prevents: the ids of the
readiness checks that the rule keeps from failing.

| Rule | Prevents | Offer it when the project shows | Can a tool enforce it? |
| --- | --- | --- | --- |
| 1 Money | COR-01, COR-08 | orders, prices, a cart, invoices, balances, credits or subscriptions in the README, the manifest description, the schema, the models or the file names; or a payments package (Stripe, Paddle, Braintree, Adyen, Mollie, Square, PayPal) | Partly: a money type first, then a lint or Semgrep rule against float types on money fields |
| 2 Input | SEC-06, COR-09 | a server that takes input: a web framework or HTTP server, route or handler files, a bot, a webhook receiver or a serverless function (see the signals below) | Partly: a schema library at every entry point, and a test per write route that sends a bad body and expects the framework's error for it (400, or 422 in FastAPI and Laravel) |
| 3 Queries | SEC-07 | a database: a driver, an ORM or a query builder in the manifest, migrations, `.sql` files, or a database URL in `.env.example`. A file named `db` with no driver is not a signal | Yes: a lint or security rule against queries built from strings (see the checkers below) |
| 4 The signed-in user | ACC-01, ACC-03, ACC-06, SEC-11 | sign-in or per-user data: an auth package, a users or sessions table or module, login routes, records with an owner | No: a test per route family (signed in as one user, ask for another user's record by id; send another user's id; send a role). Mass assignment partly: Brakeman (Ruby), Semgrep |
| 5 Secrets | SEC-01, SEC-02 | any source file, or a goal that names an outside service, an API or a key | Mostly: a secret scanner as a pre-commit hook and in CI, and a check that the built client bundle holds no key names. Rotating a committed key is done by a person |

## Signals per ecosystem

| Ecosystem | A server (rule 2) | Sign-in (rule 4) | A database (rule 3) |
| --- | --- | --- | --- |
| Python | Django, Flask, FastAPI, Starlette, aiohttp | `django.contrib.auth`, Flask-Login, Authlib, a JWT library | psycopg, SQLAlchemy, Django models, `sqlite3`, PyMySQL, PyMongo |
| JavaScript or TypeScript | Express, Fastify, Koa, Hono, NestJS, Next.js route handlers or server actions, `createServer` from `node:http` | Passport, Auth.js, Lucia, Clerk, express-session, jsonwebtoken | pg, mysql2, better-sqlite3, Prisma, Knex, Sequelize, TypeORM, Drizzle, the MongoDB driver, Mongoose |
| Go | `net/http` handlers, Gin, Echo, Chi, Fiber | gorilla/sessions, a JWT package | `database/sql`, pgx, sqlx, GORM, the MongoDB driver |
| Java | Spring Web, Jakarta Servlet, Micronaut, Quarkus | Spring Security, a JWT library | JDBC, JPA or Hibernate, jOOQ, Spring Data |
| Ruby | Rails, Sinatra, Rack | Devise, OmniAuth, `has_secure_password` | Active Record, Sequel, pg |
| PHP | Laravel, Symfony, Slim, PHP files served by a web server | Laravel Sanctum, Breeze or Fortify, Symfony Security | PDO, mysqli, Doctrine, Eloquent |

## Checkers per ecosystem

Use a checker the project already runs before adding one. In any language, Semgrep has rules for queries built from
strings and for secrets in code, and gitleaks, TruffleHog or detect-secrets scan for secrets as a pre-commit hook and
in CI.

| Ecosystem | Queries (rule 3) | Secrets (rule 5) | Money (rule 1, partly) | Input (rule 2, partly) |
| --- | --- | --- | --- | --- |
| Python | Ruff `S608` or Bandit B608 | Ruff `S105`, `S106` or Bandit B105, B106 | `Decimal`, Django `DecimalField`, SQLAlchemy `Numeric` | pydantic, Django forms or DRF serializers, marshmallow |
| JavaScript or TypeScript | Semgrep, or CodeQL `js/sql-injection`. eslint-plugin-sql `no-unsafe-query` only where queries use a `sql` tag; it does not see concatenation | eslint-plugin-no-secrets, and a CI check that the built bundle holds no key names | a branded integer type for cents in TypeScript, or a money library | zod, Valibot, Ajv, Fastify route schemas |
| Go | gosec G201 and G202 (in golangci-lint) | gosec G101 | `int64` minor units in a named type | go-playground/validator |
| Java | SpotBugs with Find Security Bugs (`SQL_INJECTION_JDBC`) | Find Security Bugs (`HARD_CODE_PASSWORD`) | `BigDecimal`, and an ArchUnit rule against `double` money fields | Bean Validation (`@Valid`) |
| Ruby | Brakeman | the any-language scanners | integer cents (money-rails) or a `decimal` column | Active Model validations, dry-validation |
| PHP | Psalm taint analysis (`TaintedSql`) | the any-language scanners | moneyphp/money or brick/money | Laravel form requests, Symfony Validator |
