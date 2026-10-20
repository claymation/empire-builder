# Story

As a track plan author, I want a scale grid and measurement readouts, so that I can place benchwork and track at intentional real-world sizes.

# Elaboration

Layout planning is dimensional work. Authors size plywood, aisles, and track to feet and inches or metric equivalents (see `units`). A regular grid and clear measurements make those sizes visible while drawing, without requiring external rulers.

The grid is a display aid over the infinite canvas (see `pan-zoom`). It does not become part of the saved track or benchwork geometry.

# Constraints

1. Grid spacing is a positive real length in plan units.
2. Measurement labels use the active unit system (see `units`).
3. Grid visibility and spacing preferences are preserved across save and load when they are plan or session settings (see `save-and-load`).

# UX

Track plan authors may show or hide the grid.

While drawing or inspecting, authors see lengths that match the active unit system—preview labels on track (see `draw-track`) and benchwork dimensions (see `draw-benchwork`).

Optional snap-to-grid may assist benchwork placement; track geometry still obeys tangency and radius rules first.

# UI

There is a control to toggle the grid (toolbar, menu, or equivalent).

The grid renders behind benchwork as light, evenly spaced lines. Spacing is readable at typical zoom levels and does not overpower track or benchwork.

A scale reference (scale bar or equivalent) shows a labeled real-world length in the viewport.

# Non-goals

- Dimension strings attached as permanent annotations on every object (optional later).
- Surveyor-grade coordinate readouts.

# Acceptance criteria

1. Author can show and hide the grid.
2. Grid spacing is a positive length; labels use active units.
3. A scale bar shows a labeled real-world length in the viewport.
4. Grid preferences that are plan/session settings survive save/load as specified.
5. Optional snap-to-grid does not override track tangency/radius rules.

# Status

Not implemented.
