# Story

As a track plan author, I want to define obstacles and keep track clear of them, so that the plan respects walls, columns, and other blocked areas.

# Elaboration

Real rooms and layout spaces contain regions where track cannot go: walls, support columns, doors, furniture, and other hard obstacles. Benchwork may also leave holes or voids that do not support track.

Obstacles are plan elements that mark blocked area. They own the “track cannot pass through obstacles” rule referenced by track and benchwork drawing (see `draw-track`, `draw-benchwork`).

# Constraints

1. An obstacle is a closed region on the plan.
2. Track must not intersect an obstacle interior.
3. Obstacles are preserved across save and load (see `save-and-load`).
4. Creating, editing, and deleting obstacles are undoable (see `undo-redo`).

# UX

Track plan authors enter an obstacle mode (or equivalent) and draw obstacle outlines with simple shape tools (rectangle and polygon at minimum).

While drawing track, previews that would intersect an obstacle cannot be committed. Feedback makes the violation obvious; invalid track uses the same red treatment as advisory constraint violations (see `constraints`).

Authors may select, reshape, and delete obstacles (see `select-and-edit`).

# UI

Obstacles render above benchwork and below track, or with equivalent layering that stays readable under track.

Obstacle fill is distinct from benchwork wood tone—neutral, semi-transparent shading with a simple stroke—so blocked area reads clearly without looking like structure the builder will construct.

# Non-goals

- Soft scenery that track may cross.
- 3D clearance envelopes beyond 2D footprint.

# Acceptance criteria

1. Author can draw rectangle and polygon obstacles.
2. Track previews intersecting an obstacle cannot commit and show hard-rule feedback.
3. Obstacles persist across save/load; edits are undoable.
4. Obstacles render distinctly from benchwork.

# Status

Not implemented.
