# Story

As a track plan author, I want to toggle visibility and locking of plan layers, so that I can focus on one concern without accidentally editing another.

# Elaboration

Plans stack benchwork, obstacles, track, grid, and optional underlays. Visibility reduces clutter; locking prevents mis-edits.

# Constraints

1. Layers include at least: grid, benchwork, obstacles, track, and reference underlay when present (see `reference-underlay`).
2. Hiding a layer does not delete its data.
3. Locked layers cannot be selected or edited until unlocked.
4. Visibility and lock state are session UI preferences; they may persist with the session/plan settings but are not undoable actions.
5. Hard rules still apply to hidden geometry (track cannot pass through an obstacle that is merely hidden).

# UX

Authors toggle eye and lock controls per layer. Hidden layers disappear from rendering; locked layers remain visible but ignore edit hits.

# UI

A layers panel or menu lists each layer with visibility and lock affordances.

# Non-goals

- Arbitrary user-defined layer trees and CAD-style layer standards.
- Per-object layer assignment beyond the fixed plan layers.

# Acceptance criteria

1. Author can hide and show benchwork, obstacles, track, and grid independently.
2. Locked track or benchwork cannot be moved or deleted until unlocked.
3. Hiding obstacles does not allow track to be committed through them.
4. Toggling visibility does not create undo entries.

# Status

Not implemented.
