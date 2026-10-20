# Story

As a track plan author, I want my track plan persisted automatically and exportable to a file, so that I can continue working later and move plans between devices.

# Elaboration

Persistence has three distinct operations:

1. **Autosave** — the working plan is written to browser local storage continuously (debounced) so revisiting the app resumes the session without a manual save step.
2. **Export / Import** — the author downloads or uploads a versioned plan file (JSON) for backup and interchange.
3. **Clear** — the author resets the editor to a new empty plan with default 4'×8' benchwork.

There is no separate manual “Save” that writes local storage; autosave is always on. UI labels use **Export** and **Import** for file operations so they are not confused with autosave.

# Constraints

1. Autosave stores one working plan per browser origin (single slot) unless `named-plans` is implemented.
2. The file schema includes a positive integer `schemaVersion` and is documented with the implementation.
3. Export includes all plan geometry and plan settings: track, benchwork, obstacles, scale, units, track types, constraints customization, and grid preferences that are plan settings (see related stories).
4. Export may omit ephemeral UI state (selection, open previews, tool mode). Viewport may be omitted (see `pan-zoom`).
5. Import replaces the working plan after confirmation if the current plan has unsaved-equivalent content already covered by autosave; the imported plan becomes the new autosave contents.
6. Clear requires confirmation. Clear is undoable in the current session (see `undo-redo`).
7. Cloud sync and accounts are out of scope.
8. On local storage quota failure, the author is notified; the in-memory plan remains editable and Export still works if possible.
9. On corrupt autosave data, the app starts a fresh default plan and notifies the author; corrupt data is not applied silently.

# UX

The track plan editing session resumes from local storage when revisiting the application.

Track plan authors export to a file and import from a file via explicit controls. Import validates `schemaVersion` and rejects unsupported or malformed files with an error message.

Track plan authors may clear the editor to return to an empty canvas with default 4'×8' benchwork after confirming the destructive action.

# UI

There are Export, Import, and Clear controls (toolbar and/or menu). There is no redundant Save button for local storage.

# Non-goals

- Multi-user collaboration and cloud backup (future product decisions).
- Autosave of undo history across reload (see `undo-redo`).
- Multiple named local plans (see `named-plans`).
- Print/PDF image export (see `print-export`).

# Acceptance criteria

1. Editing the plan updates local storage without pressing Save.
2. Reloading the app restores the working plan from autosave.
3. Export downloads a JSON file containing `schemaVersion` and plan data listed in constraints.
4. Import loads a valid exported file into the editor and autosave.
5. Import of malformed or unsupported-version files fails with a visible error and leaves the prior plan intact.
6. Clear asks for confirmation, then restores default benchwork; undo restores the pre-clear plan in-session.
7. Quota and corrupt-autosave failures surface a notification and do not crash the editor.
8. UI copy uses Export/Import/Clear, not an ambiguous dual Save for autosave.

# Status

Not implemented.
