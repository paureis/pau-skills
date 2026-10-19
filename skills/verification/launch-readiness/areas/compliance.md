# Area: compliance

Load from stage 2 when the app holds personal data, and always for stage 3 or 4. For an app with no personal data
and no business buyers, write one row `CMP-NA` (n/a, "no personal data, no business buyers"). Most rows are
questionnaire items or documents, not code. This is not legal advice: the verdict names a person (security and
compliance) for every row here that is not a plain pass.

**CMP-01 Terms of service and a privacy policy** (2, must-fix). Applies: paying customers or personal data. Check:
both published and linked at sign-up, and the privacy policy names what is collected, why, who processes it
(the subprocessors: hosting, email, analytics, AI providers) and how to ask for deletion. Pass: `file:line` of the
links, plus an `answer` row that a person reviewed them (expiry 12 months).

**CMP-02 Cookie and tracking consent** (2, must-fix). Applies: users in the EU, UK or other places with consent
rules, and any analytics or ad scripts. Check: non-essential cookies and trackers load only after consent. Pass:
`file:line` of the gate.

**CMP-03 A data processing agreement on offer** (3, must-fix). Applies: business customers that hold personal data
of their own users in the app (they are the controller, the app is the processor). Questionnaire item `dpa`.

**CMP-04 Deletion and export on request (GDPR, CCPA)** (2, must-fix). Applies: personal data. Check: a way to find
all of one person's data (SCH-07), delete it, including from search indexes, caches, analytics and, on the stated
schedule, backups, and export it in a readable format. Pass: `file:line` of the code or the runbook. Fix: medium.

**CMP-05 Data residency** (4, must-fix). Applies: a buyer or a law requires data in a region (EU, a country).
Check: the database, backups, logs, file storage and every subprocessor are in that region. Pass: infrastructure
code `file:line` plus the subprocessor list.

**CMP-06 SOC 2 or a security questionnaire** (3, must-fix). Applies: enterprise buyers. Check: a SOC 2 report (type
I first, then type II), or answers ready for the buyer's questionnaire (SIG, CAIQ or their own). Questionnaire item
`soc2`. Fix: bigger; a person (security and compliance) and months of evidence.

**CMP-07 HIPAA and business associate agreements** (4, must-fix). Applies: only health data about US patients.
Check: a BAA signed with every vendor that touches the data (hosting, database, email, logging, AI providers);
vendors that will not sign are not used for that data; access to the data is logged (ACC-07). Questionnaire item
`baa`.

**CMP-08 PCI DSS scope** (2, must-fix). Applies: card payments.
Check: card numbers never reach the app's servers or logs (a hosted checkout or the processor's fields in an
iframe keep the app at SAQ A); if they do, the app is in full PCI scope and needs a person. Pass: `file:line` of the
checkout integration.

**CMP-09 Children's data** (2, must-fix). Applies: users under 13 (COPPA) or under 16 in parts of the EU. Check:
age gate, parental consent, no behavioral ads. Needs a person.

**CMP-10 Accounts in the company's name** (2, must-fix). Domains, cloud, app stores, payment processor, email
sender, source hosting and every API key owned by a company account with two or more admins, not one person's
login. Questionnaire item `company-accounts`.

**CMP-11 Incident and breach plan** (3, must-fix; 4, must-fix with the legal deadline). Who decides, who tells
customers, and in what time (72 hours under GDPR). Questionnaire items `incident-plan` and `stolen-laptop`.
