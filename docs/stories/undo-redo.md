# Story

As a track plan author, I want to undo and redo edits, so that I can correct mistakes without rebuilding the plan.

# Elaboration

Track planning is iterative. Authors commit sections, reshape benchwork, and reclassify track, then reverse or reapply those steps when a choice is wrong.

Undo and redo operate on committed plan changes. Ephemeral interaction state—track previews, hover rings, and the viewport (see `pan-zoom`)—is not on the history stack.

# Constraints

1. Undo reverses the most recent undoable action; redo reapplies the most recently undone action.
2. A new undoable action after undo clears the redo branch.
3. Undoable actions include committing or removing track, benchwork edits, track type changes (see `track-type`), unit system changes (see `units`), and clear plan (see `save-and-load`).
4. Pan, zoom, selection changes, and in-progress previews are not undoable actions.
5. Undo history is for the current editing session only; it need not survive reload.
6. History depth may be capped at a practical limit.

# UX

Track plan authors undo and redo from the keyboard and from controls.

After undo or redo, the canvas matches the restored plan. Drawing tools remain usable; an open preview is cancelled if history changes the plan underneath it.

When nothing remains to undo or redo, the corresponding action is unavailable.

# UI

There are undo and redo controls (toolbar or menu).

Standard shortcuts: Undo is Ctrl+Z (⌘Z on macOS); Redo is Ctrl+Shift+Z (⌘⇧Z on macOS) and Ctrl+Y on platforms where that is conventional.

Controls are disabled when their stack is empty.

# Status

Not implemented.
