# Story

As a track plan author, I want to save and load my track plan, so that I can continue working on it later.

# Elaboration

The layout is saved to and loaded from local storage automatically, for friction-free editing. Track plan authors may optionally export their plan to an external file in a convenient serialization format (likely JSON).

All track and benchwork is saved.

# Constraints

None.

# UX

The track plan editing session resumes (from local storage) when revisiting the application.

Track plan authors may clear the editor to return to an empty canvas with default 4'x8' benchwork. Clear is undoable in the current session (see `undo-redo`).

# UI

There are save and load buttons and/or menu options, as well as clear.
