# Story

As a track plan author, I want freeform track drawing with optional easements, so that curves enter and leave tangents smoothly without requiring a commercial sectional catalog.

# Elaboration

Empire Builder is a **freeform** (flex-oriented) planner: authors draw continuous centerline geometry rather than snapping only to a library of fixed-length sectional pieces.

Prototype practice often inserts a spiral easement between tangent and circular curve. Modelers approximate easements with a short transition or accept a direct tangent-to-curve joint when space is tight.

# Constraints

1. Default drawing remains circular curves and tangents as in `draw-track`.
2. When easements are enabled, a transition segment may be inserted automatically between a tangent and a curve so headings match at each joint (still G1 tangent continuous).
3. Easement length is bounded by a positive default derived from scale and min radius; authors may disable easements.
4. Sectional track pack catalogs are out of scope for this product stance.

# UX

A plan or app setting enables optional easements. With easements on, previews show the transition; with easements off, behavior matches pure tangent/curve drawing.

Authors are not forced through a sectional parts picker to draw mainline.

# UI

An easements toggle (settings or constraints panel) reflects enabled/disabled state.

# Non-goals

- Full clothoid mathematics exposed as user-facing parameters beyond length/enable.
- Brand-specific sectional geometry libraries.
- Vertical easements (see `grades` for elevation).

# Acceptance criteria

1. Product documentation and this story state freeform-first; no sectional catalog is required to draw.
2. With easements off, draw behavior matches `draw-track`.
3. With easements on, a tangent-to-curve joint includes a transition and remains tangent continuous.
4. The easements setting persists with the plan.

# Status

Not implemented.
