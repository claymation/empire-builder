# Story

As a track plan author, I want to draw benchwork, so that I can define the area for the track plan.

# Elaboration

Model railroads use benchwork to support the roadbed, track, and scenery. Common benchwork construction choices are plywood sheets (for simple layouts and yards) and L-girder + riser + plywood roadbed cut with a jigsaw.

This story covers the **plan outline** of supported area (the footprint the builder will deck), not structural member detail. L-girder framing is domain context only.

Obstacles (walls, columns, and other blocked regions) are a separate plan layer owned by `obstacles`, not holes drawn as negative benchwork in this story.

# Constraints

1. Track cannot extend beyond the benchwork, as there would be nothing to support it.
2. Track cannot pass through obstacles (see `obstacles`).
3. Benchwork regions are closed shapes. Self-intersecting outlines are rejected or auto-repaired to simple polygons before commit.
4. Multiple disjoint benchwork regions are allowed (islands). Holes inside a region are out of scope here; use obstacles for blocked interior area.
5. Benchwork edits are undoable (see `undo-redo`).

# UX

New layouts begin with a 4' tall by 8' wide benchwork area representing a 4'×8' sheet of plywood — a common first layout for many modelers. Dimensions are displayed in the active unit system (see `units`).

Track plan authors enter a benchwork drawing mode and edit the benchwork layer with these tools:

1. **Rectangle** — click-drag an axis-aligned rectangle.
2. **Polyline** — click successive vertices; double-click or Enter closes the shape.
3. **Push/pull** — drag an edge or edge segment of an existing region to grow or shrink the footprint.

Connected closed outlines are filled as solid supported area. Overlapping regions merge into one filled area on commit (union).

While drawing track, a preview that would leave benchwork cannot be committed. Feedback matches other hard-rule failures: the invalid preview uses the red treatment described in `constraints`, and commit is refused until the preview lies entirely on benchwork.

Authors may select, reshape, and delete benchwork with `select-and-edit`. Grid and optional snap assist placement (see `grid-and-measurements`, `snap-guides`).

# UI

Benchwork is rendered below obstacles and track in its own static layer.

Benchwork is pale yellowish fill (resembling wood) with light brown thin stroke border.

Benchwork mode exposes rectangle, polyline, and push/pull controls (toolbar or equivalent).

# Non-goals

- Multi-deck framing, riser schedules, and lumber cut lists.
- Boolean holes cut out of benchwork (use `obstacles` for blocked area).
- 3D benchwork visualization.

# Acceptance criteria

1. A new plan shows default 4'×8' benchwork in the active unit system.
2. Author can add benchwork with rectangle and closed polyline tools.
3. Author can resize an existing region with push/pull on an edge.
4. Overlapping new regions union into one filled supported area.
5. Self-intersecting polylines are not committed as invalid geometry.
6. Track previews off benchwork cannot commit and show hard-rule feedback.
7. Benchwork create/edit/delete participates in undo/redo.
8. Obstacles remain a separate story and layer; this story does not define them.

# Status

Not implemented.
