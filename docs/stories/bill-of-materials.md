# Story

As a track plan author, I want a bill of materials and length summary, so that I can estimate track, turnouts, and benchwork needs.

# Elaboration

Classic planning payoff: totals for mainline length, curve counts, turnout counts, and benchwork area help shopping and construction.

# Constraints

1. Summary computes from current plan geometry and types at least: total track length by track type, number of turnouts by frog/hand when present, benchwork area, and curve count or total degrees.
2. Lengths and areas use the active unit system.
3. Summary updates when the plan changes (live or via refresh action).
4. Summary is read-only derived data; it is not separately edited.

# UX

Author opens a Summary / BOM panel to read totals. Optional copy or export of the summary as text/CSV may be offered.

# UI

A side panel or dialog lists the totals clearly.

# Non-goals

- Vendor SKU matching and shopping carts.
- Cost databases.

# Acceptance criteria

1. Panel shows total track length that matches geometry within rounding tolerance.
2. Lengths break down by track type when types exist.
3. Turnout counts appear when turnouts exist.
4. Units follow the active unit system.

# Status

Not implemented.
