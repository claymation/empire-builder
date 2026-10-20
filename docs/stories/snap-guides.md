# Story

As a track plan author, I want snap-to-grid and angle guides for benchwork and placement, so that I can align structure to real-world dimensions beyond track’s 5° draw snap.

# Elaboration

Benchwork and structures often align to inch or centimeter grids and to square corners. Track drawing already snaps angles while preserving tangency (`draw-track`); this story covers grid snap and guides for non-track geometry and for initial placement aids.

# Constraints

1. Snap-to-grid uses the grid spacing from `grid-and-measurements` when enabled.
2. Angle guides include at least 0°/90° and optional 45° increments for benchwork edges and structure sides.
3. Track geometry still prioritizes tangency and fixed radius over grid snap.
4. Snap preferences persist as session or plan settings with the grid preferences.

# UX

Author toggles snap-to-grid and sees cursor or edge snapping while drawing benchwork, obstacles, and structures. Holding a modifier temporarily disables snap.

# UI

Snap toggle near the grid control.

# Non-goals

- Full constraint-based CAD solver.
- Parametric dimensions driving geometry.

# Acceptance criteria

1. With snap on, benchwork rectangle corners land on grid intersections.
2. Modifier disables snap for the current gesture.
3. Track draw continues to obey tangency when grid snap is on.
4. Snap toggle state is restored with session/plan settings as specified.

# Status

Not implemented.
