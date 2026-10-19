# Area: UX and accessibility

Load when the app has a user interface (web, mobile or desktop). For a CLI, write one row `UX-NA` (n/a, "no
graphical interface"), and check the CLI's help and error output under OBS-06.

**UX-01 Loading, empty and error states on every screen** (2, must-fix). Applies: screens that load data. Check:
each screen shows something while loading, a useful empty state, and an error state with a way to retry, instead of
a blank page or a spinner forever. Pass: screenshots, or `file:line` of each state. Fix: small per screen.

**UX-02 Forms keep input and show errors next to the field** (2, can-wait). Applies: forms. Check: a server error
does not wipe what was typed; the submit button is disabled while sending (COR-04); errors name the field.

**UX-03 Keyboard and screen reader basics** (2, must-fix; 3, must-fix with WCAG 2.1 AA for enterprise and public
sector). Applies: a web or app UI. Check: every action works by keyboard with a visible focus, form fields have
labels, images have alt text, color contrast meets 4.5 to 1 for body text. Run axe or Lighthouse if the project can.
Pass: the tool's output as a `command` row (expiry 90 days).

**UX-04 Works on a phone** (2, can-wait). Applies: a web UI. Check: no horizontal scroll at 375 px, tap targets of
at least 44 px, inputs with the right keyboard type.

**UX-05 Destructive actions confirm and can be undone** (2, can-wait). Applies: delete, cancel, remove member.
Check: a confirmation that names what goes, and an undo or trash where SAFE-04 applies.

**UX-06 Emails and notifications** (2, can-wait). Applies: the app sends email. Check: a plain-text part, an
unsubscribe link on anything that is not transactional, and links that work when the user is signed out.

**UX-07 Support and feedback** (2, must-fix). Applies: paying customers. Check: a way to reach a person from the
app, and who answers it in what time. Questionnaire item `support`.
