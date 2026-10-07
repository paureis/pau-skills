# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this process. Based on "Design It Twice" (Ousterhout): your first idea is unlikely to be the best.

Uses the vocabulary in LANGUAGE.md: **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before generating alternatives, write a user-facing explanation of the problem space:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on
- A rough illustrative code sketch to ground the constraints (not a proposal, just a way to make the constraints concrete)

Show this to the user, then immediately proceed to Step 2.

### 2. Generate 3+ radically different interfaces

Each must produce a **radically different** interface for the deepened module. Give each a different design constraint:

- **Design 1: Minimize the interface**: aim for 1 to 3 entry points max. Maximise leverage per entry point.
- **Design 2: Maximise flexibility**: support many use cases and extension.
- **Design 3: Optimise for the most common caller**: make the default case trivial.
- **Design 4 (if applicable): Ports & adapters**: design around cross-seam dependencies.

Each design should include:

1. Interface (types, methods, params, plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Trade-offs: where leverage is high, where it's thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated: the user wants a strong read, not a menu.
