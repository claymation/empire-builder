# Story

As a track plan author on a tablet, I want touch-first drawing gestures, so that I can plan without a mouse or trackpad.

# Elaboration

Phones and tablets are common in the workshop. Touch must map clearly onto draw, pan, zoom, and select without fighting browser chrome.

# Constraints

1. One-finger drag performs the active tool gesture (draw or pan depending on mode); two-finger pinch zooms; two-finger drag pans when not conflicting with pinch.
2. Long-press may open context actions equivalent to right-click where needed.
3. Hit targets for railheads and toolbar controls meet a minimum comfortable touch size.
4. Desktop mouse/trackpad behavior in other stories remains supported.

# UX

Authors can complete benchwork and track draw flows using touch only, including commit and Esc-equivalent cancel (on-screen control if no keyboard).

# UI

On-screen Cancel/Done controls appear when a keyboard is not present.

# Non-goals

- Stylus pressure for line weight.
- Native iOS/Android apps (this is the web app).

# Acceptance criteria

1. Pinch zoom and two-finger pan work on a touch device within `pan-zoom` limits.
2. Author can draw and commit a track section using touch only.
3. Cancel is available on-screen without a physical Esc key.
4. Mouse users are unaffected on desktop.

# Status

Not implemented.
