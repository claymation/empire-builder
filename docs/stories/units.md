# Story

As a track plan author, I want to choose imperial or metric units, so that lengths and dimensions match how I measure the layout.

# Elaboration

Track plans express real-world size: benchwork outer dimensions, section length, and curve radius. Authors work in either imperial (feet and inches) or metric (meters and millimeters), depending on region and habit.

The application stores geometry in a single internal representation. Unit choice affects display and input only; switching units does not rescale the plan.

# Constraints

1. The unit system is either imperial or metric for the whole plan at a time.
2. The default unit system follows the browser locale: imperial for locales that customarily use US customary units; metric otherwise.
3. The author's unit preference is preserved across save and load (see `save-and-load`).
4. Changing units does not alter stored geometry.

# UX

On first visit, the unit system is chosen from the browser locale without prompting.

Track plan authors may switch between imperial and metric at any time. Labels and dimension readouts update immediately. Unit changes are undoable (see `undo-redo`).

Length entry and preview labels use the active system (see `draw-track`). Grid and scale bar readouts follow the same system (see `grid-and-measurements`). Default benchwork size is the same physical sheet (4'×8' / equivalent metric) regardless of display units (see `draw-benchwork`).

# UI

There is a units control (toolbar, settings, or equivalent) with imperial and metric options.

Measurement labels show feet/inches for imperial and meters/millimeters for metric, as appropriate to magnitude.

# Non-goals

- Mixed unit systems on one plan at the same time.
- Rescaling geometry when switching units.

# Acceptance criteria

1. First visit picks imperial or metric from browser locale without a prompt.
2. Switching units updates labels immediately without moving geometry.
3. Preference persists across save and load.
4. Unit changes are undoable.

# Status

Not implemented.
