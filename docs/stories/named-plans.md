# Story

As a track plan author, I want multiple named local plans, so that I can switch among layouts without overwriting them.

# Elaboration

Autosave’s single working slot is enough for one layout. Serious authors keep several schemes (room options, scales, or modules).

# Constraints

1. Each plan has a non-empty unique name within the browser origin.
2. Only one plan is active in the editor at a time; switching autosaves the current plan first.
3. Create, rename, duplicate, and delete plan operations ask for confirmation when destructive.
4. Plans remain local-only unless a future cloud story exists.
5. Storage quota failures surface the same class of notification as `save-and-load`.

# UX

A plan switcher lists named plans, opens one, and creates a new plan from default benchwork or by duplication.

# UI

Plan manager controls in the menu or start screen.

# Non-goals

- Folder hierarchies and tagging.
- Real-time sync across devices.

# Acceptance criteria

1. Author can create two named plans and switch between them without data loss.
2. Active edits autosave to the active plan’s slot.
3. Delete requires confirmation and cannot leave the app without a valid active plan (recreate default if last plan deleted).
4. Export/import still works on the active plan.

# Status

Not implemented.
