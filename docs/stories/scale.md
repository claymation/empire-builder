# Story

As a track plan author, I want to select a scale for my track plan, so that scale-appropriate constraints can be applied, and scale dimensions can be displayed (see `units`).

# Elaboration

Popular model railroad scales include G, O, S, OO, HO, TT, N, Z, and T.

# Constraints

None.

# UX

Track plan authors can select a scale at any time, but selecting a larger scale may result in the existing track violating constraints.

Selecting a scale uses the default scale-appropriate constraints, overwriting any customized constraints (after warning).

# UI

Drop-down.

# Non-goals

- Fine-grained gauge variants beyond named scales listed in elaboration.
- Automatic geometric rescale of existing track when scale changes (constraints update; geometry stays).

# Acceptance criteria

1. Author can choose a scale from the documented list via a drop-down.
2. Choosing a scale applies default constraints after a warning when it would overwrite customized constraints.
3. Larger scale selection can mark existing track as violating min-radius; geometry is not auto-rewritten.
4. Scale selection is preserved across save and load.

# Status

Not implemented.
