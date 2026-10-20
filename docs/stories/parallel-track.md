# Story

As a track plan author, I want to offset a parallel track at standard centers, so that I can build double track and yard ladders quickly.

# Elaboration

Multi-track mainlines and yards use a consistent center-to-center spacing. Authors often duplicate a path at a fixed offset rather than redrawing by eye.

# Constraints

1. Offset distance defaults to a scale-appropriate center-to-center value and must be a positive length.
2. Parallel copies remain tangent-continuous along the source path where the offset is mathematically possible; failures at tight inside curves are reported and not silently kinked.
3. Produced track obeys benchwork and obstacle hard rules.
4. Operation is undoable and persists as ordinary track after commit.

# UX

With a track selection, the author runs Offset/Parallel, previews the offset side and distance, and commits.

# UI

Offset control shows distance in active units and side (left/right along direction).

# Non-goals

- Automatic yard ladder generator.
- Superelevation.

# Acceptance criteria

1. Author can create a parallel copy at the default centers distance.
2. Author can edit the distance before commit.
3. Invalid offsets on tight curves do not commit broken geometry.
4. Undo removes the generated track.

# Status

Not implemented.
