# Story

As a track plan author, I want to define and use track placement constraints, so that I can make sure my track plan can be built.

# Elaboration

Model railroads are subject to various constraints:

* minimum turn radius, below which long locomotives and rail cars will derail
* adjacent track clearance
* vertical track clearance

The NMRA publishes standards and guidelines for popular hobby scales (HO, N, _etc_), which we apply as default constraints when the track plan author selects a scale.

# Constraints

1. Clearance constraints must be positive real numbers.

# UX

Authors may edit or disable the constraints. Authors may commit track that violates constraints; they are advisory, not mandatory.

# UI

Track that violates a constraint (committed or previewed) is red.

# Status

Not implemented.
