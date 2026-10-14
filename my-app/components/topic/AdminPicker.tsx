"use client";

/**
 * Pick an area by name: county, sub-county or ward.
 *
 * Built for the analyst who already knows the name. Three Fluent Comboboxes,
 * and every one of them searches on its own: typing "Bangale" in Ward with
 * nothing else chosen finds it anywhere in Kenya, and choosing it fills Bura
 * and Tana River above. So the shortest path is three keystrokes, Enter to
 * choose, Enter again to add, and the boxes are a cascade only for whoever
 * wants to browse down from a county.
 *
 * The rules (what each box lists, what an option says about where it sits,
 * when Add refuses) are pure and live in admin-picker.ts; the cascade itself
 * is choose() in services/geo/admin.ts. This file renders them and owns the
 * one asynchronous step, fetching the boundary.
 *
 * Under the boxes, one line says what is chosen ("Tana River > Bura >
 * Bangale") with Add beside it, and one line under that says what Add will do
 * or why it cannot. Both lines hold their height whatever they say, so the
 * card never jumps while a boundary loads or a message changes.
 */

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Combobox, Option } from "@fluentui/react-components";
import {
  Add16Regular,
  CheckmarkCircle16Filled,
  ChevronRight12Regular,
  ErrorCircle16Regular,
  ZoomFit16Regular,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import {
  ADMIN_BY_ID,
  ADMIN_LEVEL_LABEL,
  ADMIN_LEVELS,
  EMPTY_CHOICE,
  choose,
  loadAdminGeometry,
  mostSpecific,
  type AdminChoice,
  type AdminLevel,
  type AdminUnit,
} from "@/services/geo/admin";
import type { AreaOfInterest, DraftArea } from "@/services/analysis/selection";
import {
  LEVEL_PLURAL,
  addAction,
  adminDraft,
  choicePath,
  levelWord,
  listAnnouncement,
  listFootnote,
  matchParts,
  pickerOptions,
} from "@/components/topic/admin-picker";

export interface AdminPickerProps {
  areas: readonly AreaOfInterest[];
  /** The scope's area cap. Past one, Add refuses at the cap with the reason. */
  maxAreas: number;
  onAdd: (draft: DraftArea) => void;
  /** Re-centre the map on an area already in the list. */
  onShow: (id: string) => void;
}

type Queries = Record<AdminLevel, string | null>;
const NO_QUERIES: Queries = { county: null, subcounty: null, ward: null };

/** What the line under Add says, apart from the standing hint. */
type Outcome =
  | { kind: "loading"; unit: AdminUnit }
  | { kind: "failed"; unit: AdminUnit }
  | { kind: "added"; unit: AdminUnit }
  | { kind: "shown"; unit: AdminUnit };

/**
 * Start fetching a unit's county file as soon as it is chosen, so that by the
 * time Add is pressed the boundary is usually already here. The bundler
 * caches the module, so Add's own load of the same file costs nothing. A
 * failure here is ignored: Add loads again and reports it there.
 */
function warm(unit: AdminUnit) {
  loadAdminGeometry(unit).catch(() => {});
}

export default function AdminPicker({ areas, maxAreas, onAdd, onShow }: AdminPickerProps) {
  const [choice, setChoice] = useState<AdminChoice>(EMPTY_CHOICE);
  // What is typed in each box, or null while it shows its chosen name.
  const [queries, setQueries] = useState<Queries>(NO_QUERIES);
  const [open, setOpen] = useState<AdminLevel | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const messageId = useId();

  const unit = mostSpecific(choice);
  const action = addAction(choice, areas, maxAreas);
  const busy = outcome?.kind === "loading";

  const pick = (level: AdminLevel, next: AdminUnit | null) => {
    setChoice((current) => choose(current, level, next, ADMIN_BY_ID));
    setQueries(NO_QUERIES);
    setOutcome(null);
    if (next !== null) warm(next);
  };

  /** Back up the path: choosing "Bura" in the breadcrumb drops the ward. */
  const keepTo = (level: AdminLevel) => {
    const below = ADMIN_LEVELS[ADMIN_LEVELS.indexOf(level) + 1];
    if (below !== undefined) pick(below, null);
  };

  const add = async () => {
    if (unit === null || busy || action.disabledReason !== null) return;
    if (action.existing !== null) {
      onShow(action.existing.id);
      setOutcome({ kind: "shown", unit });
      return;
    }
    setOutcome({ kind: "loading", unit });
    try {
      const draft = adminDraft(unit, await loadAdminGeometry(unit));
      if (draft === null) throw new Error(`empty boundary for ${unit.id}`);
      onAdd(draft);
      setOutcome({ kind: "added", unit });
    } catch {
      setOutcome({ kind: "failed", unit });
    }
  };

  const path = choicePath(choice);

  return (
    <div className="flex flex-col">
      {/*
        County on its own row, then Sub-county and Ward side by side once the
        card is wide enough for two names (a container query, so it follows
        the card's width, not the window's: the card is 360px wide beside the
        map and full width below it).
      */}
      <div className="@container flex flex-col gap-3">
        <LevelBox
          level="county"
          choice={choice}
          query={queries.county}
          open={open === "county"}
          canAdd={unit !== null && action.disabledReason === null && !busy}
          onQuery={(q) => setQueries({ ...NO_QUERIES, county: q })}
          onOpen={(isOpen) => setOpen(isOpen ? "county" : null)}
          onPick={(u) => pick("county", u)}
          onAdd={add}
          describedBy={messageId}
        />
        <div className="grid gap-3 @min-[22rem]:grid-cols-2">
          {(["subcounty", "ward"] as const).map((level) => (
            <LevelBox
              key={level}
              level={level}
              choice={choice}
              query={queries[level]}
              open={open === level}
              canAdd={unit !== null && action.disabledReason === null && !busy}
              onQuery={(q) => setQueries({ ...NO_QUERIES, [level]: q })}
              onOpen={(isOpen) => setOpen(isOpen ? level : null)}
              onPick={(u) => pick(level, u)}
              onAdd={add}
              describedBy={messageId}
            />
          ))}
        </div>
      </div>

      {/* The chosen path, and the one action that adds it. */}
      <div className="mt-4 flex min-h-8 items-center gap-3 border-t border-edge pt-3">
        <p className="type-body1 flex min-w-0 flex-1 flex-wrap items-center gap-x-1 text-ink">
          <span className="sr-only">Chosen: </span>
          {path.length === 0 ? (
            <span className="text-ink-faint">Nothing chosen yet</span>
          ) : (
            path.map((u, i) => {
              const last = i === path.length - 1;
              return (
                <span key={u.id} className="inline-flex min-w-0 items-center gap-1">
                  {i > 0 && (
                    <ChevronRight12Regular aria-hidden="true" className="shrink-0 text-ink-faint" />
                  )}
                  {last ? (
                    <span className="truncate font-semibold">
                      {u.name}
                      <span className="sr-only"> {levelWord(u.level)}</span>
                    </span>
                  ) : (
                    // A parent in the path is a shortcut to adding it instead:
                    // one click on "Bura" drops the ward, and Add then adds
                    // the whole sub-county.
                    <button
                      type="button"
                      onClick={() => keepTo(u.level)}
                      title={`Use the whole ${levelWord(u.level)} instead`}
                      className="truncate rounded-fluent-small text-ink-muted underline decoration-edge-strong underline-offset-2 hover:text-accent-link hover:decoration-current"
                    >
                      {u.name}
                      <span className="sr-only">
                        {" "}
                        {levelWord(u.level)}, use the whole {levelWord(u.level)} instead
                      </span>
                    </button>
                  )}
                </span>
              );
            })
          )}
        </p>
        <Button
          type="button"
          onClick={() => void add()}
          disabled={unit === null || action.disabledReason !== null}
          aria-describedby={messageId}
          icon={
            busy ? (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent-soft border-t-accent"
              />
            ) : action.existing !== null ? (
              <ZoomFit16Regular />
            ) : (
              <Add16Regular />
            )
          }
          className="shrink-0"
        >
          {busy ? "Adding..." : action.label}
        </Button>
      </div>

      <Message
        id={messageId}
        outcome={outcome}
        reason={action.disabledReason}
        replaces={maxAreas === 1 && action.existing === null ? (areas[0]?.label ?? null) : null}
        hasChoice={unit !== null}
        onRetry={() => void add()}
      />
    </div>
  );
}

/**
 * The line under Add: what just happened, else why Add cannot act, else what
 * it will do. One line tall at rest and announced politely, so a keyboard user
 * hears "Added Bangale." without leaving the box they pressed Enter in.
 */
function Message({
  id,
  outcome,
  reason,
  replaces,
  hasChoice,
  onRetry,
}: {
  id: string;
  outcome: Outcome | null;
  reason: string | null;
  replaces: string | null;
  hasChoice: boolean;
  onRetry: () => void;
}) {
  const base = "type-caption1 mt-1.5 flex min-h-5 items-start gap-1.5";
  if (outcome?.kind === "failed") {
    return (
      <div id={id} role="alert" className={`${base} text-danger`}>
        <ErrorCircle16Regular aria-hidden="true" className="mt-px shrink-0" />
        <span className="min-w-0 flex-1">
          Could not load the {outcome.unit.name} boundary. Check the connection, then{" "}
          <button
            type="button"
            onClick={onRetry}
            className="rounded-fluent-small font-semibold text-accent-link underline underline-offset-2"
          >
            try again
          </button>
          .
        </span>
      </div>
    );
  }
  let text: string;
  let tone = "text-ink-faint";
  let icon = false;
  if (outcome?.kind === "loading") {
    text = `Loading the ${outcome.unit.name} boundary...`;
    tone = "text-ink-muted";
  } else if (outcome?.kind === "added") {
    text = `Added ${outcome.unit.name}. It is on the map and in the list below.`;
    tone = "text-ink-muted";
    icon = true;
  } else if (outcome?.kind === "shown") {
    text = `${outcome.unit.name} is already in the list. Showing it on the map.`;
    tone = "text-ink-muted";
  } else if (reason !== null) {
    text = reason;
  } else if (replaces !== null && hasChoice) {
    text = `Replaces ${replaces}: a single location takes one area.`;
  } else {
    text = "Press Enter in any box to add what is chosen.";
  }
  return (
    <p id={id} role="status" aria-live="polite" className={`${base} ${tone}`}>
      {icon && <CheckmarkCircle16Filled aria-hidden="true" className="mt-px shrink-0 text-success" />}
      <span className="min-w-0 flex-1">{text}</span>
    </p>
  );
}

interface LevelBoxProps {
  level: AdminLevel;
  choice: AdminChoice;
  query: string | null;
  open: boolean;
  /** Enter on a closed box adds, when there is something addable. */
  canAdd: boolean;
  onQuery: (query: string | null) => void;
  onOpen: (open: boolean) => void;
  onPick: (unit: AdminUnit | null) => void;
  onAdd: () => void;
  describedBy: string;
}

/**
 * One labelled, searchable box.
 *
 * Controlled on every axis Fluent offers (the text, the selected option, and
 * a record of whether it is open) because the list is filtered here, not by
 * Fluent: a 1452-option list must never reach the DOM, so only the capped
 * matches are rendered as options and Fluent's own prefix matcher only ever
 * sees those.
 */
function LevelBox({
  level,
  choice,
  query,
  open,
  canAdd,
  onQuery,
  onOpen,
  onPick,
  onAdd,
  describedBy,
}: LevelBoxProps) {
  const id = useId();
  const selected = choice[level];
  const typed = query ?? "";
  const result = useMemo(() => pickerOptions(level, choice, typed), [level, choice, typed]);
  const everything = useMemo(() => pickerOptions(level, choice, "").total, [level, choice]);
  const footnote = listFootnote(level, result, typed);

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // Enter on a closed box with its chosen name showing is "add it". Caught
    // before Fluent, whose own Enter on a closed box would reopen the list.
    if (event.key === "Enter" && !open && query === null && canAdd) {
      event.preventDefault();
      event.stopPropagation();
      onAdd();
    }
  };

  return (
    <div className="min-w-0" onKeyDownCapture={onKeyDownCapture}>
      <label htmlFor={id} className="type-caption1 block font-semibold text-ink">
        {ADMIN_LEVEL_LABEL[level]}
      </label>
      <Combobox
        id={id}
        className="mt-1"
        // Fluent's root carries a 250px min-width, which would push a
        // half-width box out of a 360px card. Inline, because Griffel's rule
        // sits outside Tailwind's layers and outranks any utility.
        style={{ minWidth: 0, width: "100%" }}
        aria-describedby={describedBy}
        clearable
        placeholder={`Search ${everything.toLocaleString("en-GB")} ${LEVEL_PLURAL[level]}`}
        value={query ?? selected?.name ?? ""}
        selectedOptions={selected !== null ? [selected.id] : []}
        // Inline rather than portalled: Fluent stamps the provider's classes
        // (FluentRoot's full-height flex column) on a portal's mount node,
        // which then lay over the page and swallowed clicks on Add. Inline,
        // the list is a sibling of its input, so the card holding it must
        // not clip (no overflow-hidden on it in AreasStep).
        inlinePopup
        positioning={{ position: "below", align: "start" }}
        // About seven two-line options, then it scrolls. Wider than a half
        // box, so "Bura, Tana River" under a name is not cut short.
        listbox={{ style: { minWidth: 240, maxHeight: 320 } }}
        // Place names are not dictionary words; a red underline under
        // "Samburu" reads as an error.
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onQuery(event.target.value)}
        onOpenChange={(_, data) => {
          onOpen(data.open);
          // Closing without choosing puts the chosen name back.
          if (!data.open) onQuery(null);
        }}
        onOptionSelect={(event, data) => {
          if (data.optionValue !== undefined) {
            onPick(choiceById(data.optionValue));
            return;
          }
          // Fluent clears the selection as soon as the typed text stops
          // matching it. Only an emptied box or the clear button means
          // "clear": typing a new name must not wipe the boxes below.
          const input = event.target as HTMLInputElement | null;
          if (event.type === "change" && (input?.value ?? "") !== "") return;
          onPick(null);
        }}
      >
        {result.options.map(({ unit, context }) => (
          <Option
            key={unit.id}
            value={unit.id}
            text={unit.name}
            // Said as one phrase, "Bangale, Bura, Tana River". Left to the
            // content, the two stacked lines are read with a stray space.
            aria-label={context === "" ? unit.name : `${unit.name}, ${context}`}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">
                {matchParts(unit.name, typed).map((part, i) =>
                  part.match ? (
                    <strong key={i} className="font-semibold">
                      {part.text}
                    </strong>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </span>
              {context !== "" && (
                <span className="type-caption1 truncate text-ink-faint">{context}</span>
              )}
            </span>
          </Option>
        ))}
        {footnote !== null && (
          // Not an option, so arrows skip it; the live region below says the
          // same thing to a screen reader.
          <p
            aria-hidden="true"
            className="type-caption1 mt-1 border-t border-edge px-2 pb-1 pt-2 text-ink-faint"
          >
            {footnote}
          </p>
        )}
      </Combobox>
      {/* Always mounted, filled while open: a live region inserted already
          holding its text is not announced. */}
      <p role="status" aria-live="polite" className="sr-only">
        {open ? listAnnouncement(level, result) : ""}
      </p>
    </div>
  );
}

function choiceById(id: string): AdminUnit | null {
  return ADMIN_BY_ID.get(id) ?? null;
}
