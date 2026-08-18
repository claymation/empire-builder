# Story

As a track plan author, I want to place turnouts (switches), so that I can branch routes and build passing sidings and yards.

# Elaboration

A turnout splits one route into two (or joins two into one). Modelers specify turnouts by frog number or angle and by hand (left/right) or geometry (straight through route plus diverging route, or curved turnouts).

Turnouts are first-class track elements with three legs that must join tangent to adjoining sections at each railhead.

# Constraints

1. Each turnout has a defined frog number or equivalent angle from a supported set chosen at implementation time (document defaults for HO/N at least).
2. Each leg presents a railhead that obeys the same tangency rules as ordinary sections (see `draw-track`).
3. Turnout geometry must remain on benchwork and outside obstacles.
4. Placing, moving, rotating, and deleting turnouts are undoable (see `undo-redo`).
5. Turnout type/hand is preserved across save and load (see `save-and-load`).

# UX

Track plan authors choose a turnout tool (frog number and hand), then click a railhead or canvas location to place a preview. Rotation aligns the through route; a second click or drag commits.

Authors may insert a turnout onto an existing tangent section, splitting that section, when geometry fits.

Incompatible placement (kink, off-benchwork, obstacle hit) cannot commit; feedback matches other hard-rule failures.

# UI

Turnout midline uses the same stroke language as other track; frog area may use a simple schematic symbol sufficient to read hand and divergence.

A turnout control lists supported frog numbers and left/right (or wye) options.

# Non-goals

- Slip switches, three-way, and double slip in the first delivery (may follow once basic turnouts work).
- Electrical power routing and frog polarity.
- Animated points.

# Acceptance criteria

1. Author can place a left and a right turnout from a railhead with a supported frog number.
2. Each leg joins only when tangent; invalid previews do not commit.
3. Insert-on-section splits the host section and preserves continuity on the through route.
4. Delete and undo remove or restore the turnout and repaired sections.
5. Turnouts round-trip through export/import.

# Status

Not implemented.
