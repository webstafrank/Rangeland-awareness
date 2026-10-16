"""Fail the runs a restart interrupted. Run once per start, before serving.

The container entrypoint calls this after `migrate` and before gunicorn starts,
which is the one moment no run can be live (see `runner.recover_interrupted`).
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.analysis.jobs.runner import recover_interrupted


class Command(BaseCommand):
    help = "Mark runs left queued or running by a restart as failed."

    def handle(self, *args, **options) -> None:
        count = recover_interrupted()
        self.stdout.write(f"{count} interrupted run(s) marked failed")
