"""Prediction runs: Random Forest, XGBoost, or both, for the four topics.

The contract is `contracts/prediction.md`. The modules, in pipeline order:

    recipes.py      per topic: the target, its labels, its mask, its features
    sources.py      where layers come from (GeoServer + GIBS live, or injected)
    features.py     layers onto the run grid, coverage checks, the sample table
    labels.py       the targets, as pure numpy on synthetic-testable stacks
    models.py       training, held-out validation, metrics, importance
    statistics.py   the result's numbers, each rule the contract states
    pipeline.py     the ten stages, in order, reporting as they go

The overlay (`pipeline/overlay.py`) is untouched by all of this. A flood-risk
run without `model` is still exactly that overlay.
"""
