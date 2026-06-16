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

**US-6 — Place turnouts (switches).**
I want to place turnouts where one track diverges into two, so that I can build
sidings, passing loops, and yards, given that a layout with no branching is just
a loop and cannot support operations or industries.

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
