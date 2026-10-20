# Story

As a track plan author, I want to assign elevation and grade on track, so that I can plan hills, overpasses, and vertical clearance.

# Elaboration

Even simple 2D plans benefit from height marks. Grade is rise over run, usually expressed as a percent. Vertical clearance between crossing routes and under obstacles matters for operations.

# Constraints

1. Elevation is stored at control points or per section endpoints; intermediate elevation interpolates along the section.
2. Grade percent displays in the active workflow; values may be negative for descent.
3. A maximum recommended grade constraint may warn (advisory, like min radius) without blocking commit (see `constraints`).
4. Vertical clearance checks against overlapping track and against obstacle height when height is defined on obstacles; until obstacle height exists, clearance warns only between track routes that cross in plan view with elevations.
5. Elevation edits are undoable and persist across save/load.

# UX

Authors set elevation at a selected railhead or point on track. The UI shows grade on sections between points.

Crossing routes without sufficient vertical separation flag an advisory violation (red or equivalent).

# UI

Elevation callouts appear at edited points in active units. Grade labels may appear on steep sections.

# Non-goals

- Full 3D terrain mesh editing.
- Helix designer as a separate specialized tool (may use grades + loops manually).
- Dynamic simulation of train drag.

# Acceptance criteria

1. Author can set elevations at two ends of a section and see computed grade.
2. Advisory feedback appears when grade exceeds the configured maximum.
3. Crossing tracks with insufficient vertical separation flag a clearance warning when elevations imply a conflict.
4. Elevation data survives export/import and undo.

# Status

Not implemented.
