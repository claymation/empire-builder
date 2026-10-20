# Story

As a track plan author, I want to select, delete, and edit committed track and benchwork, so that I can revise the plan without starting over.

# Elaboration

Drawing alone is not enough. Authors correct routes, shorten sections, remove mistakes, and reshape benchwork after geometry is committed.

Selection identifies what subsequent delete or edit commands affect. Edits change committed geometry or properties; they do not replace the draw tools (see `draw-track`, `draw-benchwork`).

# Constraints

1. Only committed plan elements can be selected—not previews.
2. Delete removes the current selection from the plan.
3. Edits must preserve hard rules: adjoining track stays tangent, track stays on benchwork, and track does not pass through obstacles (see `obstacles`).
4. Delete and edit are undoable (see `undo-redo`).
5. Selection alone is not an undoable action.

# UX

Track plan authors select sections or benchwork shapes by clicking. Modifier keys or drag gestures may extend the selection to multiple elements where practical.

Delete removes the selection via keyboard and controls. After delete, adjoining track presents open railheads where joins were broken.

Authors may edit selected track properties (for example track type—see `track-type`) and reshape benchwork with the same classes of tools used to create it (see `draw-benchwork`).

Esc clears the selection. Selecting empty canvas clears the selection.

# UI

Selected track and benchwork show a clear selection treatment (highlight, handles, or equivalent) distinct from hover and from the active railhead (see `draw-track`).

There is a delete control (toolbar or menu). Delete is disabled when the selection is empty.

Standard shortcut: Delete/Backspace removes the selection when the canvas has focus and a text field does not.

# Non-goals

- Free transform of track that breaks tangency without repair.
- Numeric property inspector beyond track type (future work).

# Acceptance criteria

1. Click selects committed track or benchwork; empty canvas or Esc clears selection.
2. Delete/Backspace removes the selection and is undoable.
3. Edits cannot commit geometry that breaks hard track rules.
4. Selection alone is not undoable.

# Status

Not implemented.
