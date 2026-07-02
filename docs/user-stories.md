# User Stories

This file is Empire Builder's lightweight stand-in for a ticket system (Jira,
Plane, etc.). It records what we're building and why, from the hobbyist's point
of view. Keep stories in the "As a… I want… so that… given that…" shape so the
motivation and the constraint travel with the requirement. Update it as scope
changes; treat the **Future / out of scope** section as a promise to keep the
design from painting us into a corner, not as a backlog commitment.

The persona throughout is:

> **As a model railroad hobbyist, I want to…**

## Scope & assumptions (v1)

These are settled defaults for the first version. Revisit explicitly rather than
drifting away from them.

- **Real-world units** (inches / mm). The plan describes a physical benchwork.
- **2D, top-down** view only. No elevation, grades, or helixes yet (see Future).
- **One plan at a time.**
- **Infinite canvas.** The user never sets a canvas size; they pan and zoom over
  an unbounded surface. The "available space" (US-1) is a *constraint region*
  drawn on that surface, not the bounds of the canvas.
- **Track is modeled as a centerline path.** Rail width and clearance envelopes
  are derived from the scale. Clearance (US-12) is measured centerline-to-
  centerline.
- **Sections form a connected graph**, joined at their endpoints, with
  **tangency enforced** at each join (no kinks). Curves may connect to straights
  *or to other curves* (reversing loops, S-curves, compound curves).
- **Constraints are layered:** the scale sets defaults → an optional per-role
  override → an optional per-section override. Violations are **flagged, never
  blocked** — a tight curve may be a deliberate choice on an industrial spur.

## Design notes

- **Massaging the plan is the killer feature.** Moving, rotating, or resizing a
  connected section ripples through its neighbors: it can break cotangent curves
  and introduce constraint violations elsewhere. Making "push / pull / massage"
  feel intuitive — preserving tangency where it can, showing violations live,
  letting the user nudge a layout into shape instead of deleting and redrawing —
  is what makes this app worth using. It is also the hardest part to build and
  deserves thoughtful, iterative design.
- **Connectivity may arrive in slices.** A reasonable first vertical slice can
  treat sections as independent pieces, with snapping and rigid (tangency-
  preserving) connectivity layered on afterward.

## Status — built so far (2026-06-24)

A first interactive slice is in place: you can lay a connected run of track on a
fixed sheet — with snapping, tangent connections onto open ends, and undo.
Everything else below is not yet started.

**Built**

- **US-3 / US-4 — Lay straight and curved track.** The single "lay track"
  gesture extends the railhead: a preview follows the pointer — a straight when
  aimed ahead, the tangent arc reaching toward the pointer when off to one side
  — and a click commits it. Curve sweeps snap to 15° increments (within ~5°);
  the radius is fitted so the snapped arc still tracks the pointer. Holding
  Option/Alt suspends snapping. Sections chain with tangency enforced by
  construction, so a run can never kink.
- **US-5 — Connect sections at their endpoints.** While drawing, the target
  snaps onto an open end's point (shown as a ring) or onto its tangent / normal
  lines (shown as a guide), which lines a return leg up with the start. Within a
  run, tangency at every join holds by construction. Laying a section back onto
  an open end is tangency-gated — the point snap is offered only when that
  section arrives tangent — so a connection, closing a loop included, joins
  without a kink; once the tail rejoins the anchor the run has no free end and
  drawing stops. First-class loop-closing is deliberately out of scope: most
  layouts have open ends, and snapping a tangent section onto the start covers
  the closed case.
- **US-9 — Undo and redo** (⌘Z / ⇧⌘Z), built alongside the drawing tool.
- **US-16 (partial) — Running total.** The status line shows the section count
  and total run in inches. Per-section lengths and a flex-track total are not
  yet shown.

**Scaffolding present, not user-facing yet**

- **US-1 (partial).** The available space exists as a constraint region and is
  drawn — a default 8′×4′ sheet — but it is not user-definable and has no
  keep-out zones.
- **Units.** Geometry is real-world millimeters with inch/foot helpers;
  measurements display in inches. No model **scale** (US-12) is selected yet.

**Not started:** US-2 (pan/zoom), US-6 (turnouts), US-7 (move/rotate/resize —
the "massaging" feature), US-8 (delete), US-10/US-11 (roles, labels),
US-12–US-15 (scale, clearance, minimum radius, violations), US-17–US-20
(export, import, auto-save, print).

---

## Canvas & space

**US-1 — Define the available space.**
I want to define the available space for the empire (its footprint and any
keep-out zones such as a fireplace, doorway, support column, or duck-under), so
that I can design a track plan that fits the room, given the physical constraint
that track cannot occupy the same space as an obstruction. Constraints breed
creativity — think of this as defining where the railroad may live, drawn on an
infinite canvas rather than a fixed-size page.

**US-2 — Pan and zoom.**
I want to pan and zoom the canvas, so that I can work at the inch level and still
see the whole empire, given that layouts span many real feet while the details
that matter (clearances, tangency) live at the inch level.

## Drawing track

**US-3 — Draw straight (tangent) track.**
I want to draw sections of straight track of arbitrary length, so that I can
think above the level of off-the-shelf sectional track lengths, given that many
hobbyists use flex track or handlaid trackwork.

**US-4 — Draw curved track.**
I want to draw sections of curved track of arbitrary radius and arc, connecting
to straights or to other curves, so that I can create an interesting track plan,
given that railroads must curve around obstacles and change direction — model
railroads especially, due to space constraints and non-prototypical features
like reversing loops.

**US-5 — Connect sections at their endpoints.**
I want adjacent sections to snap together at their endpoints, with smooth
(tangent) joins, so that trains have a continuous path, given that a gap or kink
between sections is unrealistic and derails trains in the real world.

**US-5-1 — Create an endpoint (drop an anchor).**
I want to start drawing anywhere on the canvas, so that I can begin laying track,
given that the track has to start somewhere.

**US-5-2 — Select an existing endpoint.**
I want to be able to select an open endpoint to draw from, so that I can extend
the layout from any possible railhead, given that real railroads grow this way.

**US-5-3 - Connect existing sections and networks.**
I want to be able to draw a connection between two existing sections, so that I
can design common layout features (ovals, reversing loops, passing sidings),
given that track must be connected for trains to travel over it.

**US-6 — Place turnouts (switches).**
I want to place turnouts where one track diverges into two, so that I can build
sidings, passing loops, and yards, given that a layout with no branching is just
a loop and cannot support operations or industries.

### Interaction model for US-3 / US-4

Drawing a straight and drawing a curve are one gesture, not two tools. A single
"lay track" tool extends the open end of the current run (the railhead): as the
pointer moves, a preview follows it — a straight when the pointer is aimed
straight ahead, and the unique arc that stays tangent at the railhead and
reaches toward the pointer when it is off to one side. A straight is just the
degenerate, zero-curvature case of that arc. A click commits the previewed piece
and the railhead advances. Modifier keys add precision (snap heading/radius/
length to standard values; disable snapping for fine control) rather than
switching modes.

Two ways to build the same oval, both supported: draw around it as one run
(straight, curve, straight, curve) and snap the last piece back to the start to
close the loop; or draw two parallel straights and connect their open ends with
curves. Both reduce to the same operation — joining two open ends with an
auto-computed tangent arc, which is the interactive form of US-5.

Because a drawing tool is unusable without forgiving recovery, **undo/redo
(US-9) is built alongside this work**, not deferred.

## Editing

**US-7 — Move, reorient, and resize sections.**
I want to move, rotate, and resize drawn sections, so that I can experiment with
alternate layouts, given that deleting and redrawing track would be tedious and
unfriendly. Connected neighbors should stay attached and follow the change where
possible — see the **Design notes** on massaging the plan, the heart of this
feature.

**US-8 — Delete sections.**
I want to delete drawn sections, so that I can correct mistakes or design
dead-ends, given that the first design is unlikely to be the best one.

**US-9 — Undo and redo.**
I want to undo and redo my edits, so that I can experiment freely and recover
from mistakes, given that fear of irreversible changes discourages the very
experimentation this app exists to encourage.

**US-10 — Classify track by role.**
I want to assign a role to each section (mainline, branch, yard, industrial
spur), so that role-appropriate constraints apply, given that a sharp curve
acceptable on a spur is unacceptable on the mainline.

**US-11 — Label and annotate.**
I want to add labels and notes (town names, industries, track numbers), so that
I can capture and communicate the plan's intent, given that a track plan is also
an operating and storytelling document.

## Standards, constraints & feedback

**US-12 — Specify a scale.**
I want to specify a scale (e.g., HO, N, Z) for the railroad, so that I get
default constraints appropriate for that scale, given that HO track is larger
and demands a larger minimum radius than N, for example.

**US-13 — Define track clearance constraints.**
I want to define constraints for track-to-track clearance, so that I can adhere
to NMRA standards, given that tracks too close together — especially in curves —
cause collisions and derailments.

**US-14 — Define minimum-radius constraints.**
I want to define a minimum-radius constraint, so that I can adhere to conventions
for reliable operation and realistic appearance, given that long locomotives and
passenger cars look ridiculous and derail on tight curves.

**US-15 — See constraint violations.**
I want to see constraint violations (e.g., a too-tight curve or insufficient
clearance) highlighted live, so that I can see where the design may need
adjustment, given that a violation may be warranted on an industrial spur but
not on a mainline — so violations are flagged, never blocked.

**US-16 — See measurements and running totals.**
I want to see measurements — individual section lengths, total mainline run, and
total flex track required — so that I can judge and budget the plan, given that
"how much railroad did I get" and "what will it cost" are central decisions.

## Persistence & output

**US-17 — Export the track plan to a file.**
I want to export the track plan to a file for local storage, so that I can save
it for later work, given that the web app has no backend or storage (JS only).

**US-18 — Import a track plan.**
I want to import a track plan from a file, so that I can view and edit it, given
that the web app has no backend or storage (JS only). Import must handle
malformed or incompatible files gracefully rather than failing silently.

**US-19 — Auto-save in the browser.**
I want my work auto-saved in the browser (local storage), so that I don't lose
progress on an accidental refresh or close, given that there is no backend and
remembering to export manually is easy to forget.

**US-20 — Print or export an image.**
I want to print or export the plan as an image or PDF (optionally to scale), so
that I can reference it at the workbench, given that I build the physical layout
away from the computer.

---

## Future / out of scope (keep the design open)

Not planned for v1, but the design should not preclude them:

- **Display dimensions in scale**, in addition to real-world units — secondarily
  or on request (e.g., "this 30″ radius is N scale feet"). A convenience layer
  over the real-world geometry, not a replacement for it.
- **Elevation, grades, and helixes** — the move to 2.5D / 3D.
- **Curve easements / transition spirals** for prototypical, reliable curves.
- **Electrical wiring**, including reverse-loop gap detection.
- **Bill of materials** for users who build from sectional track.
- **Mixed scale / narrow gauge** (e.g., HOn3) within one plan.
