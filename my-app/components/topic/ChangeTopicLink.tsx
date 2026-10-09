"use client";

/**
 * The topic band's quiet way back to the four topics.
 *
 * Hidden on the running and results routes. There a run is in progress or
 * being shown, and a "Change topic" link beside it invites abandoning a live
 * run. Back, the rail-less result pages' own links and the sidebar still
 * leave; this just stops offering it as the next thing to do.
 *
 * A client component only for useSelectedLayoutSegment: the band lives in a
 * server layout, and a layout cannot read which child segment is showing.
 */

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { ArrowRepeatAll20Regular } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button-classes";

const RUN_SEGMENTS = new Set(["running", "results"]);

export default function ChangeTopicLink() {
  const segment = useSelectedLayoutSegment();
  if (segment !== null && RUN_SEGMENTS.has(segment)) return null;

  return (
    <Link
      href="/#topics"
      className={buttonClasses({ appearance: "subtle", className: "shrink-0" })}
    >
      <ArrowRepeatAll20Regular aria-hidden="true" className="h-4 w-4" />
      {/* Icon only on a phone, where the name needs the width; the words stay
          in the accessible name either way. */}
      <span className="sr-only sm:not-sr-only">Change topic</span>
    </Link>
  );
}
