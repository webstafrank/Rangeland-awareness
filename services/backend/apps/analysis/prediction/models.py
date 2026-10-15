"""Training, held-out validation, metrics and importance.

## Two members, fixed seeds, bounded samples

Random Forest (scikit-learn) and XGBoost, each with a fixed seed so the same
run configuration produces the same numbers twice, which the run cache already
assumes: a run id is a hash of its configuration, and a cached result that would
come out different on recompute is a lie told by the cache.

Samples are capped (`MAX_TRAIN`, `MAX_TEST`) and drawn uniformly at random with
the same seed. A county at 1 km over eight years is millions of pixel-months;
trees stop improving long before that, and the cap is what keeps a run in
minutes on a four-core machine with 7 GB of RAM.

## Class balance, without lying about probability

Positives are the minority by construction (one in five for a quintile target,
about one in eight for flood hotspots). Trained as-is, trees under-split the
minority class; trained with balanced class weights, they do better, but what
they output is then a probability under a 50/50 prior, and a map coloured with
it overstates every risk.

So both: members are trained with balanced weights (``class_weight=
"balanced_subsample"``, ``scale_pos_weight = negatives / positives``), and their
outputs are mapped back to the real base rate ``pi`` of the training labels by
Bayes' rule for a prior shift (Elkan 2001; Saerens et al. 2002):

    odds_true = odds_balanced * pi / (1 - pi)

That is exact when the classes were reweighted to equal mass, which is what
balanced weights do, and it is what makes the reported Brier score and the
"probability" on the map mean what they say. The tests check the formula on
numbers worked by hand.

## Validation is held out, never in-sample

- **Flood: spatial block cross-validation.** Neighbouring 250 m pixels are near
  duplicates; a random split puts a pixel in training and its twin in the test
  set, and reports a fake 0.99. The grid is cut into square blocks
  (`BLOCK_M`, default 5 km), blocks are dealt to `FOLDS` folds by a seeded
  shuffle, and each fold is scored by a model that never saw any pixel of its
  blocks. Metrics are computed once on the pooled out-of-fold predictions.
- **Forecasts: temporal holdout.** The most recent twelve target months are
  scored by a model trained only on earlier ones, with baselines computed
  without them (see labels.py).

The final model is then refit on everything. The metrics describe the
procedure that produced it, which is the standard meaning of a held-out score;
`validationDetail` says so in words.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np

SEED = 20261015
MAX_TRAIN = 60_000
MAX_TEST = 30_000
FOLDS = 5
BLOCK_M = 5_000.0
MIN_POSITIVES = 200


@dataclass
class Member:
    name: str
    model: Any
    #: Base rate of the labels it was fitted on, for the prior correction.
    prior: float


def uniform_subsample(count: int, cap: int, seed: int = SEED) -> np.ndarray:
    """Indices of a uniform random subset of ``range(count)``, sorted, at most
    ``cap`` long. Sorted so reading them out of a raster is sequential."""
    if count <= cap:
        return np.arange(count)
    rng = np.random.default_rng(seed)
    return np.sort(rng.choice(count, size=cap, replace=False))


def fit(name: str, X: np.ndarray, y: np.ndarray, *, threads: int = 4) -> Member:
    """Fit one member with balanced class weights and a fixed seed."""
    y = y.astype(np.int64)
    positives = int(y.sum())
    negatives = int(y.size - positives)
    if positives == 0 or negatives == 0:
        raise ValueError(
            "the training labels are all one class "
            f"({positives} positive, {negatives} negative); nothing to learn"
        )
    prior = positives / y.size

    if name == "random-forest":
        from sklearn.ensemble import RandomForestClassifier

        # NaN is passed straight through: scikit-learn >= 1.4 trees route
        # missing values to whichever side scores better, which is the honest
        # treatment of "this layer has no value here". Imputing a mean would
        # invent a value; zero-filling would invent a wrong one.
        model = RandomForestClassifier(
            n_estimators=200,
            min_samples_leaf=5,
            max_features="sqrt",
            class_weight="balanced_subsample",
            n_jobs=threads,
            random_state=SEED,
        )
        model.fit(X, y)
    elif name == "xgboost":
        from xgboost import XGBClassifier

        model = XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.08,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=2,
            scale_pos_weight=negatives / positives,
            tree_method="hist",
            eval_metric="logloss",
            n_jobs=threads,
            random_state=SEED,
        )
        model.fit(X, y)
    else:
        raise ValueError(f"unknown model {name!r}")
    return Member(name=name, model=model, prior=prior)


def correct_prior(p_balanced: np.ndarray, prior: float) -> np.ndarray:
    """Map a balanced-prior probability back to the true base rate ``prior``."""
    p = np.clip(np.asarray(p_balanced, dtype=np.float64), 1e-9, 1 - 1e-9)
    odds = p / (1 - p) * (prior / (1 - prior))
    return (odds / (1 + odds)).astype(np.float32)


def predict(member: Member, X: np.ndarray) -> np.ndarray:
    raw = member.model.predict_proba(X)[:, 1]
    return correct_prior(raw, member.prior)


def metrics(y: np.ndarray, p: np.ndarray, threshold: float = 0.5) -> dict[str, float | None]:
    """AUC, accuracy, F1 and Brier on held-out labels.

    AUC is None when the held-out labels are all one class, which is a fact
    about the test set, not a score of zero; the pipeline warns when it happens.
    """
    from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, roc_auc_score

    y = np.asarray(y).astype(np.int64)
    p = np.asarray(p, dtype=np.float64)
    predicted = (p >= threshold).astype(np.int64)
    auc: float | None
    if np.unique(y).size < 2:
        auc = None
    else:
        auc = float(roc_auc_score(y, p))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        f1 = float(f1_score(y, predicted, zero_division=0))
    return {
        "auc": None if auc is None else round(auc, 4),
        "accuracy": round(float(accuracy_score(y, predicted)), 4),
        "f1": round(f1, 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
    }


# ---------------------------------------------------------------- the splits

def spatial_blocks(rows: np.ndarray, cols: np.ndarray, block_px: int) -> np.ndarray:
    """One integer block id per sample, from its grid row and column."""
    block_px = max(1, int(block_px))
    block_rows = np.asarray(rows) // block_px
    block_cols = np.asarray(cols) // block_px
    width = int(block_cols.max()) + 1 if block_cols.size else 1
    return (block_rows * width + block_cols).astype(np.int64)


def block_folds(blocks: np.ndarray, folds: int = FOLDS, seed: int = SEED) -> np.ndarray:
    """A fold per sample, assigned by block, never by pixel.

    Blocks are shuffled with a fixed seed and dealt round-robin, so folds have
    near-equal block counts and a block's pixels always land together. Fewer
    blocks than folds reduces the fold count rather than leaving a fold empty.
    """
    unique = np.unique(blocks)
    k = min(folds, unique.size)
    if k < 2:
        raise ValueError(
            f"only {unique.size} spatial block(s); at least 2 are needed to "
            "hold any of them out"
        )
    rng = np.random.default_rng(seed)
    order = rng.permutation(unique.size)
    fold_of_block = np.empty(unique.size, dtype=np.int64)
    fold_of_block[order] = np.arange(unique.size) % k
    return fold_of_block[np.searchsorted(unique, blocks)]


def temporal_holdout(sample_months: np.ndarray, holdout_months: int = 12) -> np.ndarray:
    """True for samples whose month is among the last ``holdout_months``
    distinct months present. Months are ordinal integers (year*12+month)."""
    distinct = np.unique(sample_months)
    if distinct.size <= holdout_months:
        raise ValueError(
            f"{distinct.size} months of labels; more than {holdout_months} are "
            "needed to hold the most recent year out and still train"
        )
    cutoff = distinct[-holdout_months]
    return sample_months >= cutoff


# ---------------------------------------------------------------- importance

def importance(member: Member, columns: list[str], groups: dict[str, str]) -> dict[str, float]:
    """Normalised importance per FEATURE, summing one-hot columns back up.

    Random Forest: mean decrease in impurity. XGBoost: total gain per feature,
    which is what ``feature_importances_`` reports for the hist booster. Both
    are normalised to sum to 1 before being merged, so neither dominates the
    average merely by being on a larger scale.
    """
    raw = np.asarray(member.model.feature_importances_, dtype=np.float64)
    raw = np.where(np.isfinite(raw), raw, 0.0)
    by_feature: dict[str, float] = {}
    for column, value in zip(columns, raw):
        feature = groups.get(column, column)
        by_feature[feature] = by_feature.get(feature, 0.0) + float(value)
    total = sum(by_feature.values())
    if total <= 0:
        share = 1.0 / len(by_feature) if by_feature else 0.0
        return {k: share for k in by_feature}
    return {k: v / total for k, v in by_feature.items()}


def merged_importance(parts: list[dict[str, float]]) -> dict[str, float]:
    """The members' normalised importances averaged, renormalised to 1."""
    keys = sorted({k for part in parts for k in part})
    averaged = {k: sum(part.get(k, 0.0) for part in parts) / len(parts) for k in keys}
    total = sum(averaged.values())
    if total <= 0:
        return averaged
    ordered = sorted(averaged.items(), key=lambda kv: -kv[1])
    return {k: round(v / total, 8) for k, v in ordered}
