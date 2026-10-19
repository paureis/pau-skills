# Questionnaire

What code cannot show. Ask only the items whose rows apply to the profile and the stage, all in one message, after
the code checks and before the verdict. Each answer becomes an `answer` row: the evidence is who answered, the
date and the answer in their words; the expiry is the date plus the validity below. An expired answer goes back to
`recheck` and is asked again on the next run. "I don't know" or no answer is `unknown`, with "ask <role>" as how to
check. Never fill an answer in yourself.

| Item | Question | Rows | From stage | Valid for |
| --- | --- | --- | --- | --- |
| `backups` | Are backups automatic? How often, kept how long, stored where? | SAFE-01 | 1 | 12 months |
| `restore-tested` | When did someone last restore a backup into a fresh database, and what was checked after? | SAFE-02 | 2 | 12 months |
| `pitr` | Is point-in-time recovery on, and for how many days? | SAFE-03 | 2 | 12 months |
| `key-rotation` | Was every key found in git history rotated at the provider? | SEC-02 | 1 | 12 months |
| `spend-caps` | Which paid APIs have a hard cap or budget alert, and at what amount? | SEC-15, AI-03 | 1 | 6 months |
| `cost-alerts` | Who receives the cloud billing alerts? | DEL-13 | 2 | 6 months |
| `on-call` | Who is paged when the app is down, how, and who covers when they are away? | OBS-04 | 2 | 3 months |
| `uptime-check` | Is there an outside uptime check, and who does it alert? | OBS-03 | 2 | 6 months |
| `support` | How does a customer reach a person, and who answers in what time? | UX-07 | 2 | 6 months |
| `company-accounts` | Are the domain, cloud, payment, email and source accounts owned by the company with two or more admins? | CMP-10 | 2 | 12 months |
| `owners` | Who on the team can explain and change auth, billing, the data model and deploys without an agent? | CODE-01 | 2 | 6 months |
| `policies-reviewed` | Has a person reviewed the terms and the privacy policy against what the app does? | CMP-01 | 2 | 12 months |
| `disclosure` | Is there a published way to report a vulnerability, and who reads it? | SEC-25 | 3 | 12 months |
| `access-review` | When were production access and admin roles last reviewed, and by whom? | ACC-09 | 3 | 3 months |
| `soc2` | Is there a SOC 2 report or a filled security questionnaire to send buyers? | CMP-06 | 3 | 12 months |
| `dpa` | Is there a data processing agreement to offer business customers? | CMP-03 | 3 | 12 months |
| `incident-plan` | Who decides and who tells customers when data leaks, and within what time? | CMP-11 | 3 | 12 months |
| `stolen-laptop` | If a team laptop is stolen: is the disk encrypted, and can its sessions and keys be revoked in an hour? | CMP-11 | 3 | 12 months |
| `disaster-recovery` | Are there written steps to rebuild in a new region or account, and when were they rehearsed? | DEL-14 | 3 | 12 months |
| `baa` | Is a BAA signed with every vendor that touches health data? | CMP-07 | 4 | 12 months |
| `residency` | Where must the data stay, and is every vendor in that region? | CMP-05 | 4 | 12 months |

Ask in plain words, numbered, with the stage each matters for, and say that skipping is fine: a skipped item stays
`unknown` and shows in the verdict. On a later run, ask only the items whose rows are `unknown`, `recheck` or past
their expiry.
