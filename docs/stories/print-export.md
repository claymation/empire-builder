# Story

As a track plan author, I want to print or export an image/PDF of my plan, so that I can share and take the plan to the workshop.

# Elaboration

JSON export preserves editability; image/PDF export preserves a visual snapshot for sharing and construction reference.

# Constraints

1. Export includes currently visible layers at a chosen paper size or pixel resolution.
2. Scale bar and optional grid may be included.
3. Output is at least one of: PNG, SVG, or PDF (implementation chooses; PDF or PNG minimum).
4. Print uses the browser print pipeline or a generated PDF.

# UX

Author opens Print/Export image, chooses paper or resolution, confirms visible layers, and downloads or prints.

# UI

A Print / Export image control distinct from JSON Export in `save-and-load`.

# Non-goals

- Full publishing layout suite (title blocks, multi-sheet map books) beyond a single sheet/image.
- Plotter-specific drivers.

# Acceptance criteria

1. Author can produce a PNG or PDF (or SVG) of the current plan view.
2. Hidden layers do not appear in the output.
3. Output includes enough of the plan to recognize benchwork and track at the chosen scale.
4. JSON export remains separate and unchanged.

# Status

Not implemented.
