# Story

As a track plan author, I want to join two open railheads, so that I can close loops and connect routes built from different ends.

# Elaboration

Continuous running and many freelanced routes need closed loops and connections between branches. Authors often build two approaches toward a meeting point, or close an oval back on itself.

A join merges two compatible open railheads into a single continuous path. Drawing already snaps to a railhead when extending a section (see `draw-track`); this story covers finishing a connection when both ends already exist.

# Constraints

1. Both ends must be open railheads.
2. The join is allowed only when the meeting geometry is tangent (no kink).
3. Joined track must remain on benchwork and outside obstacles (see `draw-benchwork`, `obstacles`).
4. Join is undoable (see `undo-redo`).

# UX

When the author drags or draws one railhead onto another within snap tolerance and tangency holds, the UI offers a join (auto-join on commit, or an explicit join action—one clear interaction is enough).

If tangency or clearance fails, the join does not occur; feedback indicates the ends will not connect cleanly.

After a successful join, both railheads disappear and the sections form one continuous run.

# UI

Joinable railhead pairs highlight when they are in range and geometrically compatible (for example matching ring treatment in electric blue).

Incompatible nearby ends do not show the join-ready highlight.

# Status

Not implemented.
