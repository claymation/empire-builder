# Story

As a track plan author, I want to draw straight track sections, so that I can start or extend a track plan.

# Elaboration

Prototype railroads use straight ("tangent") track whenever possible because it enables high-speed operation, reduces wear on tracks and trucks, and is the shortest (and therefore least expensive) route between two points.

# UX

Authors draw straight track by selecting a "railhead" (an open end), moving the mouse pointer to preview track, and then clicking to set the endpoint and commit the previewed track section to the layout. The previewed track section "snaps" to straight or curved (see `draw-curved-track`) in 5° angle increments, unless snapping is disabled with Alt/Option.

# UI

Previewed track is electric blue; committed track is black. We use a single stroke to represent the track midline; we do not draw each rail. Mainline track is heavier than siding, spur, and yard track.
