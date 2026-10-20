# Story

As a track plan author, I want to draw straight and curved track sections, so that I can start or extend a track plan.

# Elaboration

Prototype railroads use straight ("tangent") track whenever possible because it enables high-speed operation, reduces wear on tracks and trucks, and is the shortest (and therefore least expensive) route between two points.

Prototype railroads use curved track to follow terrain and avoid obstacles. Model railroaders often add curves for scenic interest and continuous running operation (_e.g._, ovals, loop-to-loop, and dogbone layouts).

Prototype railroad engineers measure curves by their degree of curvature; model railroaders use radius.

Straight and curved sections are one continuous draw interaction. There is no separate curved-track story.

# Constraints

1. Adjoining track sections must be tangent; they cannot kink, as trains would derail.
2. Track cannot extend beyond the benchwork, as there would be nothing to support it.
3. Track cannot pass through obstacles (see `obstacles`).
4. Curves have a fixed radius for the duration of a single section.
5. Curves tighter than the minimum radius constraint (see `constraints`) are flagged, but allowed.

# UX

Track plan authors draw track by selecting a "railhead" (an open end), moving the mouse pointer to preview track, and then clicking to set the endpoint and commit the previewed track section to the layout. The previewed track section "snaps" to straight or curved in 5° angle increments, unless snapping is disabled with a modifier key, in which case the preview follows the mouse pointer as closely as possible while adhering to the tangency and fixed radius constraints.

Track plan authors may create a new railhead by clicking on the canvas to anchor a new section, and then "aiming" the section by moving the mouse pointer to preview a straight section. If the user desires a straight section, clicking again sets the second endpoint and commits the section to the layout. If the user desires a curved section, holding a modifier "locks" the heading, and moving the mouse pointer again draws an arc; clicking again sets the second endpoint, committing the section to the layout.

Curve radius is selected by moving the mouse pointer; the preview arc follows the pointer as closely as possible for natural interaction. There is no separate radius preset picker in the draw flow.

Hovering over an inactive railhead (open end) while drawing snaps to the railhead (~5 px magnet) if and only if the sections would join tangent. Clicking to commit joins the sections. Closing a gap between two existing open ends is covered by `join-railheads`.

Track previews include a label at the free end (near the mouse pointer) that includes the section length ℒ, radius ℛ (curved sections), and heading angle ∠ (straight sections). Length and radius use the active unit system (see `units`).

Drawing continues automatically from the active railhead. Drawing is terminated by pressing Esc.

Previews that would leave benchwork or intersect an obstacle cannot be committed. Feedback makes the hard-rule violation obvious (see `obstacles`, `draw-benchwork`). Advisory min-radius and clearance violations use the red treatment in `constraints` and do not block commit.

Committed sections can be selected, deleted, and edited (see `select-and-edit`), and stepped back or forward with undo and redo (see `undo-redo`). Track type is assigned per `track-type`.

# UI

Committed track is rendered above the benchwork in its own static layer. Previewed track is rendered above committed track in a layer redrawn as the mouse pointer moves.

Committed track is solid black; previewed track is dashed electric blue; track violating a constraint is red (see `constraints`). We use a single stroke to represent the track midline; we do not draw each rail. Mainline track is heavier than siding, spur, and yard track (see `track-type`).

Railheads (open ends) are rendered as dots. When hovered or selected, a dot grows a ring. The active railhead is electric blue.

# Non-goals

- Sectional track libraries and commercial piece catalogs (see `easements` for freeform vs sectional product stance).
- Turnouts and crossings (see `turnouts`).
- Grades and elevation (see `grades`).
- Moving or reshaping committed geometry inside this story (see `select-and-edit`).

# Acceptance criteria

1. Author can place a new straight section from an empty canvas click and a second click.
2. Author can extend an existing railhead with straight or curved sections under tangency.
3. Curve radius follows the pointer; a single committed curve keeps a constant radius.
4. Angle snap defaults to 5° and is disableable with the documented modifier.
5. Preview labels show length, and radius or heading, in the active unit system.
6. Commit is blocked when the preview leaves benchwork or hits an obstacle; min-radius violations remain committable and render red.
7. Esc ends the draw sequence; undo reverses a committed section.
8. No reference to a non-existent `draw-curved-track` story remains.

# Status

Not implemented.
