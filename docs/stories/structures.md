# Story

As a track plan author, I want simple structure and scenery footprints, so that I can reserve space for buildings and major scenery without leaving the plan.

# Elaboration

Footprints mark where stations, industries, and large scenery sit. They may act as obstacles to track or as annotations that track may cross, depending on author choice.

# Constraints

1. A structure is a closed footprint with optional label.
2. Structures marked as blocking participate in the same hard rule as `obstacles` for track intersection.
3. Non-blocking annotations do not affect track commit.
4. Structures persist across save/load; edits are undoable.

# UX

Author draws rectangle/polygon footprints, sets label and blocking flag, and moves/deletes them via selection.

# UI

Structures render above benchwork with a distinct fill from obstacles and benchwork; labels remain readable at typical zoom.

# Non-goals

- 3D building kits and manufacturer part libraries.
- Full scenery materials system.

# Acceptance criteria

1. Author can place a labeled footprint.
2. Blocking structures prevent track commit through their interior.
3. Non-blocking footprints do not block track.
4. Structures export/import with the plan.

# Status

Not implemented.
