# Story

As a track plan author, I want to import a reference image underlay, so that I can trace a room sketch or existing plan.

# Elaboration

Authors often start from a photo of the room, a scanned sketch, or an exported image of an earlier plan. An underlay sits beneath benchwork for tracing and alignment.

# Constraints

1. Supported formats include common web images (PNG and JPEG at minimum).
2. Author can move, scale, and rotate the underlay; opacity is adjustable.
3. Underlay is not geometry; track hard rules ignore image pixels except as visual guide.
4. Underlay bytes may be stored in autosave/export with size limits; if too large, the app warns and may require re-attach on another device.
5. Underlay visibility participates in `layers`.
6. Edits to underlay transform/opacity are undoable or explicitly session-scoped; document the choice at implementation (prefer undoable transform).

# UX

Author imports an image, positions it under the plan, dims opacity, and draws benchwork/track over it.

# UI

Underlay renders beneath benchwork. Controls cover import, opacity, and transform.

# Non-goals

- Automatic vectorization of the image into track.
- PDF multi-page CAD import.

# Acceptance criteria

1. Author can import a PNG or JPEG and see it under benchwork.
2. Author can scale, move, rotate, and change opacity.
3. Hiding the underlay layer hides the image without deleting it.
4. Oversized images produce a warning rather than crashing autosave.

# Status

Not implemented.
