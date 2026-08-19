# Story

As a track plan author, I want to pan and zoom the canvas, so that I can see as much or as little of the layout as I like.

# Elaboration

The layout exists on an infinite canvas. Navigation changes only the viewport; it does not modify plan geometry.

A scale bar and measurement grid are specified in `grid-and-measurements`. Keyboard and assistive navigation are specified in `accessibility`.

# Constraints

1. Minimum zoom is 10% of the default zoom (0.1×). Maximum zoom is 1000% of the default zoom (10×).
2. Default zoom (100%, 1×) maps one plan inch to a readable on-screen size at a typical desktop resolution; exact pixel mapping may be tuned at implementation time so a 4'×8' sheet fits comfortably on first load.
3. Zoom-to-fit frames all benchwork, track, and obstacles with padding; on an empty plan (default benchwork only) it frames the default 4'×8' benchwork.
4. Viewport position and zoom are session UI state. They are restored with the working plan when the session resumes from local storage (see `save-and-load`) but are not undoable (see `undo-redo`).
5. Exported plan files need not include viewport; import may leave the current view or run zoom-to-fit once.

# UX

Pinch gestures (trackpad) and scroll wheel (mouse) zoom in and out toward the pointer (or the viewport center when the pointer is unavailable).

Holding Shift or the scroll wheel (middle button) while dragging the mouse pointer pans.

The zoom-to-fit control centers and scales the layout into the viewport per the constraints above.

After Clear plan, zoom-to-fit runs so the default benchwork is in view.

# UI

There is a zoom-to-fit button.

Optional zoom percentage readout may appear near the control; it is not required for MVP if zoom-to-fit and wheel/pinch are present.

# Non-goals

- Overview minimap.
- Animated camera paths.
- Touch-first gestures beyond trackpad pinch (see `touch-drawing`).
- Independent per-layer pan/zoom.

# Acceptance criteria

1. Wheel and pinch zoom within 0.1×–10× and stop at the limits.
2. Shift-drag and middle-button drag pan the canvas.
3. Zoom-to-fit frames existing plan content; with only default benchwork, the 4'×8' sheet is fully visible with padding.
4. Pan and zoom do not create undo history entries.
5. Resuming an autosaved session restores the last viewport.
6. Clear plan results in a view that shows the default benchwork.

# Status

Not implemented.
