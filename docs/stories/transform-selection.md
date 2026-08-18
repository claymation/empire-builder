# Story

As a track plan author, I want to copy, paste, mirror, and rotate a selection, so that I can build symmetric yards and repeated modules.

# Elaboration

Repeatable geometry speeds planning. Transforms apply to the current selection of track, benchwork, and obstacles as allowed by hard rules after the transform.

# Constraints

1. Copy stores a clipboard of the selection in-app (not necessarily OS clipboard).
2. Paste creates a new selection offset from the original; paste is undoable.
3. Rotate and mirror keep relative geometry; track joints must remain tangent after transform or the operation is rejected.
4. Transformed track must remain on benchwork and outside obstacles, or the operation is rejected with feedback.
5. Clipboard need not survive page reload.

# UX

Standard shortcuts where conventional: Copy Ctrl+C, Paste Ctrl+V, with menu equivalents. Mirror horizontal/vertical and rotate by 90° (and optionally free angle) are available on the selection.

# UI

Transform actions live on the edit menu/toolbar and are disabled with an empty selection (paste disabled with empty clipboard).

# Non-goals

- Boolean path operations.
- Non-uniform scale of track that changes gauge appearance.

# Acceptance criteria

1. Copy and paste duplicate the selection as new plan elements.
2. Mirror and 90° rotate produce valid tangent track or refuse with feedback.
3. Transforms that land off benchwork or in obstacles do not commit.
4. Each successful transform is a single undo step.

# Status

Not implemented.
