# Area: code health and ownership

Load for every app. An app built mostly by agents often runs fine and has no one who understands it. These rows say
whether a person could take it over.

**CODE-01 Someone can explain each part** (2, must-fix). Applies: any app with paying users. Check: for each main
part (auth, billing, data model, deploy), who on the team can explain and change it without an agent. Questionnaire
item `owners`. Needs a person: senior engineer or tech lead, when nobody can.

**CODE-02 A README that gets a new developer running** (1, can-wait). Applies: any project. Check: how to install,
configure, run, test and deploy, and it works when followed. Pass: `file:line`, and the commands it gives run.

**CODE-03 Dead code, duplicates and stubs** (2, can-wait). Applies: any project. Check: unused files, several
versions of the same helper, functions that return placeholder data, and commented-out code. Agents often leave a
second implementation next to the first. Pass: the grep or the linter's unused-code report.

**CODE-04 Types and lint on in CI** (2, can-wait). Applies: languages with a type checker or linter (TypeScript
`tsc --noEmit`, mypy or pyright, `go vet`, clippy, RuboCop, ESLint, Ruff). Check: the checker runs in CI and passes
without a blanket ignore.

**CODE-05 Dependencies kept to what is used** (2, can-wait). Applies: third-party packages. Check: unused packages,
several libraries doing the same job, abandoned packages (no release in two years). Package vulnerabilities are
SEC-13.

**CODE-06 Configuration in one place** (1, can-wait). Applies: any app. Check: settings read from the environment or
one config module, with a list of every variable the app needs (`.env.example` or the README).

**CODE-07 A license and third-party notices** (2, can-wait; 1, must-fix for a published package). Applies: shipped
or published code. Check: a LICENSE file and that the licenses of the dependencies allow the use.

**CODE-08 Release notes** (2, can-wait). Applies: a published package or app with users. Check: a changelog or
release notes per version.
