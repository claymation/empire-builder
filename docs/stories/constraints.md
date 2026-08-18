# Story

As a track plan author, I want to define and use track placement constraints, so that I can make sure my track plan can be built.

# Elaboration

Model railroads are subject to various constraints:

* minimum turn radius, below which long locomotives and rail cars will derail
* adjacent track clearance
* vertical track clearance

The NMRA publishes standards and guidelines for popular hobby scales (HO, N, _etc_), which we apply as default constraints when the track plan author selects a scale (see `scale`). Hard placement rules—tangency, benchwork bounds, and obstacles (see `obstacles`)—remain separate from these advisory constraints.

# Constraints

1. Clearance constraints must be positive real numbers.

# UX

Authors may edit or disable the constraints. Authors may commit track that violates constraints; they are advisory, not mandatory.

# UI

Track that violates a constraint (committed or previewed) is red.

# Non-goals

- Mandatory blocking of advisory clearance/radius rules (those remain advisory; hard rules live on track/benchwork/obstacles stories).
- Full NMRA standards encyclopedia inside the product UI.

# Acceptance criteria

1. Selecting a scale installs documented default constraints for that scale (see `scale`).
2. Author can edit each clearance/radius value to a positive real number or disable a constraint.
3. Track that violates an enabled advisory constraint renders red in preview and when committed.
4. Authors can still commit track that violates advisory constraints.
5. Constraint values persist across save/load with the plan.

# Status

Not implemented.
