# Story

As a track plan author, I want to classify track sections by type (mainline, siding, spur, yard), so that the plan shows operating intent and visual weight matches each track's role.

# Elaboration

Prototype and model railroads distinguish track by role, not only by geometry.

- **Mainline** carries through traffic between yards and destinations. It is the primary route and is drawn heaviest.
- **Siding** is a track beside the mainline used for meets, passes, or storage while remaining part of the through plant.
- **Spur** is a stub track serving an industry or other endpoint; traffic usually enters and leaves the same way.
- **Yard** track is used for classification, storage, and making up trains inside a yard ladder or bowl.

Classification is a property of each track section. It does not change tangency, radius, or benchwork rules.

# Constraints

1. Every committed track section has exactly one track type.
2. The default type for newly drawn track is mainline.
3. Track type is preserved across save and load (see `save-and-load`).
4. Changing track type does not move geometry or break joins.

# UX

Track plan authors set the active track type before or while drawing; new sections receive the active type when committed.

Authors may change the type of existing sections after selecting them. Type changes are undoable (see `undo-redo`).

The active track type is visible while drawing so authors know what they will place.

# UI

Track type controls the midline stroke weight of committed track: mainline is heavier than siding, spur, and yard track (see `draw-track`).

There is a track type control (toolbar, palette, or equivalent) listing mainline, siding, spur, and yard.

Selected sections show their type in the same control.

# Non-goals

- Speed limits, signaling rules, or operating sessions driven by type.
- Automatic type inference from geometry.

# Acceptance criteria

1. Every new section defaults to mainline unless another active type is selected.
2. Author can set active type while drawing and reclassify selected sections.
3. Stroke weight reflects type; geometry and joins are unchanged by type edits.
4. Type is preserved across save/load and is undoable when changed.

# Status

Not implemented.
