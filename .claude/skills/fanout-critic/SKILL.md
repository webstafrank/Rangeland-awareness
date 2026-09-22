---
name: fanout-critic
description: Fan-out plus harsh-critic loop for large work — how to decompose into parallel builder sub-agents, run variant tournaments, name the reference before building, and loop against a blind critic until it passes. Invoke for every task triaged large, and for medium tasks that split into truly independent units. Non-negotiable protocol; see "Task sizing" in CLAUDE.md for whether to fan out at all.
---

Fan-out + harsh critic — for large work
This section is non-negotiable and must never be removed.

This section is a permanent, explicit opt-in to multi-agent orchestration (ultracode / the Workflow tool) for every task triaged large, and for medium tasks that split into truly independent units. Small tasks never fan out. The triage block (see "Task sizing") is where the call is made and announced; when this loop runs, say so out loud, and when it is skipped, say that too and why.

Step 0 — name the reference before building. The critic is only as good as what it judges against. Every task that enters this loop (and every medium task getting its one cold critic pass) writes down its reference first, in order of preference:

The real thing (copy/parity work): the actual product being matched. Blind side-by-side.
Best-in-class analog (new work): the best existing example of this kind of deliverable, named explicitly. Judged side-by-side even though we are not copying it.
A frozen rubric (nothing comparable exists): concrete acceptance criteria plus the measurable outcome, written on the critic side BEFORE building starts. Frozen once building begins; the builder cannot negotiate it down or write its own exam.
No reference, no build. If you can't write down what "wowed" means for this task, that's a Confusion Protocol stop.

The loop, for every task triaged large:

Decompose and fan out. Independent units, one builder sub-agent per unit, run in parallel via the Workflow tool or isolated sessions/worktrees. Serial work on parallelizable units is wasted wall-clock. Every new feature gets a variant tournament, no exceptions: 2-3 competing builders on the SAME unit, so the critic has variants to compare blind. Because they write the same files at the same time, tournament builders are launched with isolation: "worktree" — see "Branching", where sharing one working tree between parallel writers is exactly the failure being designed out. For other unit types (fixes, docs, perf), run a tournament whenever the unit is judgment-heavy (design, approach, UX).
Builder never grades its own work. Every unit's output goes to a separate critic sub-agent that had no part in building it and never sees the builder's reasoning. Deliverable plus reference only; a critic that reads the builder's justification pre-agrees with it. Self-review does not count as review.
The critic is harsh by default; its job is to reject. Blind wherever comparison exists: outputs labeled A/B in random order (ours vs. the reference, or variant vs. variant) so the critic doesn't know which is ours. The verdict must be concrete: which is better and exactly why. "Pretty good" is a FAIL. "Acceptable" is a FAIL. It passes only when the critic is genuinely wowed and would pick ours (or can't tell) in the blind comparison.
Loop until pass. Builder revises against the critic's named findings. A fresh critic re-judges cold each round, no memory of wanting to be nice. A pass requires the critic's explicit verdict, never the builder's claim.
Stall rule. If 3 consecutive rounds produce no improvement on the critic's named criteria, stop looping and report BLOCKED with the critic's last verdict, the evidence, and what's missing (asset, tool, or decision from Franklyn). The critic has no memory, so the orchestrating session detects the stall by comparing successive verdicts in /tmp/<task>/critique/. Do not silently lower the bar to exit the loop.
Evidence or it didn't happen. Every critic verdict ships with its artifacts: screenshots, diffs, metrics, the A/B comparison result. Keep them under /tmp/<task>/critique/ and reference the exact paths in the final report. They stay in /tmp, never in the repo (Safety: no binaries committed).
The critic per work type (the pattern is constant, the weapon changes):

Copy/parity: real reference, blind side-by-side, visual and behavioral.
New feature: rubric plus best-in-class analog; variant tournament always (see loop step 1); critic uses it cold like a first-time user.
Bug fix: the reference is the repro. The critic is an attacker: re-break the fix, probe neighboring inputs, verify the regression test fails with the bug present.
Performance: numeric budget stated before work starts; the critic reads only the numbers.
Docs: critic reads cold and actually follows them; the first confusion is a FAIL.
Security/code quality: adversarial reviewer trying to break it (inputs, races, edge cases).
Solo (no fan-out) is the rule for: small tasks, most medium tasks, conversational answers, and reading/investigation that fits in one context. Medium bug fixes still get the one cold critic pass from "Task sizing" (an attacker on the repro), just not the tournament. When in doubt between medium and large, triage says pick medium; when a large task is in doubt about how to split, fan out.

