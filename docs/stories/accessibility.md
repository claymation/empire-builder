# Story

As a track plan author, I want keyboard and accessible controls, so that I can navigate and edit the plan without relying only on pointer gestures.

# Elaboration

Pointer-driven canvas tools are primary, but authors need keyboard equivalents for pan, zoom, tools, and document actions. Controls must expose names for assistive technologies. Contrast must keep track, benchwork, and focus states distinguishable.

# Constraints

1. All primary toolbar/menu actions are reachable by keyboard (tab order and shortcuts where documented).
2. Keyboard pan uses arrow keys (with a larger step when Shift is held); keyboard zoom uses `+`/`-` or equivalent.
3. Focus is visible on controls; canvas focus enables Delete, undo/redo, and Esc behaviors already specified elsewhere.
4. Interactive controls have accessible names; icon-only buttons include text alternatives.
5. Status and error messages are available to assistive tech (not color-only). Constraint red remains necessary but not sufficient feedback.

# UX

Authors can switch tools, undo/redo, delete, pan, zoom, and activate Export/Import/Clear without a mouse.

# UI

Shortcut cheatsheet may live in help; shortcuts match platform conventions already listed in `undo-redo` and related stories.

# Non-goals

- Full screen-reader narration of every geometry vertex.
- Complete WCAG certification claim in this story (implement to meet these concrete criteria first).

# Acceptance criteria

1. Arrow keys pan; `+`/`-` zoom within `pan-zoom` limits when the canvas is focused.
2. Toolbar actions are keyboard activatable and named for assistive tech.
3. Delete, undo, redo, and Esc work when focus is not in a text field.
4. Constraint and error feedback includes non-color text or accessible messaging.

# Status

Not implemented.
