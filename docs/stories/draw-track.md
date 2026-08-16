# Story

As a track plan author, I want to draw straight and curved track sections, so that I can start or extend a track plan.

# Elaboration

Prototype railroads use straight ("tangent") track whenever possible because it enables high-speed operation, reduces wear on tracks and trucks, and is the shortest (and therefore least expensive) route between two points.

Prototype railroads use curved track to follow terrain and avoid obstacles. Model railroaders often add curves for scenic interest and continuous running operation (_e.g._, ovals, loop-to-loop, and dogbone layouts).

Prototype railroad engineers measure curves by their degree of curvature; model railroaders use radius.

# Constraints

1. Adjoining track sections must be tangent; they cannot kink, as trains would derail.
2. Track cannot extend beyond the benchwork, as there would be nothing to support it.
3. Track cannot pass through obstacles.
4. Curves have a fixed radius.
5. Curves cannot be tighter than a scale-dependent minimum radius.

# UX

Track plan authors draw track by selecting a "railhead" (an open end), moving the mouse pointer to preview track, and then clicking to set the endpoint and commit the previewed track section to the layout. The previewed track section "snaps" to straight or curved (see `draw-curved-track`) in 5° angle increments, unless snapping is disabled with a modifier key, in which case the preview follows the mouse pointer as closely as possible while adhering to the tangency and fixed radius constraints.

Track plan authors may create a new railhead by clicking on the canvas to anchor a new section, and then "aiming" the section by moving the mouse pointer to preview a straight section. If the user desires a straight section, clicking again sets the second endpoint and commits the section to the layout. If the user desires a curved section, holding a modifier "locks" the heading, and moving the mouse pointer again draws an arc; clicking again sets the second endpoint, committing the section to the layout.

Track previews include a label at the free end (near the mouse pointer) that includes the section length ℒ, radius ℛ (curved sections), and heading angle ∠ (straight sections).

Drawing continues automatically from the active railhead. Drawing is terminated by pressing Esc.

# UI

Committed track is solid black; previewed track is dashed electric blue. We use a single stroke to represent the track midline; we do not draw each rail. Mainline track is heavier than siding, spur, and yard track.

Railheads (open ends) are rendered as dots. When hovered or selected, a dot grows a ring. The active railhead is electric blue.

# Status

Not implemented.
