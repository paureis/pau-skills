# Rationale template

The page that ships with the sketch. One page, plain headings, no filler. Replace each note with the content.

## Problem

One paragraph: what is being built, and what about the existing code or the constraints makes the shape
non-obvious. Name the constraints grounding found (types to interoperate with, callers that cannot break,
invariants that cross the seam), so the reader sees what you saw.

## Usage

Written before the types. The example a caller reads first, and two or three realistic call sites in the callers'
own code: what they import, what they call, what comes back. The sketch below is derived from this.

## Shape

The chosen design. Data structures first, then how data flows through the signatures. Name the decisions everything
else rests on. Say which invariants the types enforce, where validation happens, and what the design deliberately
does not do. Judge depth: what the interface hides, what it still exposes, and why it is no larger than it needs to
be.

## How the candidates were compared

Which sketch became the base and why, what was taken from each other sketch, what was rejected and why, and which
red flags each sketch raised. When an arena run produced the design, its synthesis note goes here.

## Tradeoffs accepted

One line each, in the form "we accept X in exchange for Y". Include anything a later reader could mistake for an
oversight.

## Alternatives considered

At least one concrete alternative shape and why it lost, judged on depth: what complexity it would have exposed to
callers and what it would have hidden. When the constraints left only one viable shape, say "this was the only
viable shape because ...". Different shapes only, not variants of the same one.

## Open questions and risks

Phrased as questions the user can answer, not as statements.

## Deviations

Filled in during implementation: each place the code needed something the sketch did not have, whether the sketch,
the requirement or the implementation was wrong, and what changed. Two deviations of the same shape are the signal
to scrap the sketch.

## First implementation step

One sentence: the first behaviour to build, test first, against the sketch.
