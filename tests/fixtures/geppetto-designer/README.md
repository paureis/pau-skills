# Fixture: a design system for the designer's cold run

`design-system/` is a small design system in plain CSS and HTML: the tokens in `tokens.css`, three components in
`components/` (button, card, field), one finished screen, `screens/sign-in.html` (the keyframe), and `BRIEF.md`, the
brief for a second screen. `tests/geppetto-designer.test.mjs` checks that every file in it other than `tokens.css`
and the Markdown uses only tokens, and that the tokens have no success colour.

This README sits outside the copied folder on purpose: the designer must not read what it is expected to find.

## The cold run

1. Make a throwaway git repository and copy the contents of `design-system/` into its root, so that `tokens.css`,
   `components/`, `screens/` and `BRIEF.md` are at the top. Commit them.
2. In that repository, run geppetto Create for a designer. It should start from `templates/designer.md`, suggest
   `tokens.css` as the tokens file, the `--text-*` and `--space-*` tokens as the type and spacing scales,
   `components/`, `screens/` and the keyframe `screens/sign-in.html`, and fill "The design system" with those paths
   and names, never with values.
3. Run the designer with `BRIEF.md` as its task. The brief says: Write `screens/order-confirmed.html`.

## What the run should find

- A new `screens/order-confirmed.html` that uses only tokens and the three components, built the way the keyframe is.
- One invented value: a success colour for the confirmation banner. The tokens have a primary colour, a danger colour
  and neutrals only, so none of them reads as success. The report lists it under "Invented values" with its
  file:line, the literal, what it is for, and the nearest token (primary or danger) and why it did not fit.
- Nothing else invented: no literal size, space, radius, shadow, duration, font, weight, line height or border width.

To check the screen, scan it with the patterns the test uses on the fixture: hex colours, `rgb(` and `hsl(`, numbers
with a unit, and `font-family`, `font-weight` and `line-height` values that are not `var(--...)`. Ignore a `#`
followed only by digits, which is text such as an order number, not a colour. Every hit other than the success colour
is a miss, and so is a keyword the scan does not catch, such as `font-weight: bold` or `border: thin`, when the report
does not list it.
