"use client";

import { useState } from "react";
import { FIELD } from "./fields";

type Draft = { name: string; description: string };

/** Small bordered text buttons, the same weight as the row arrows beside them. */
const CONTROL =
  "rounded border border-hairline px-2 py-0.5 text-xs text-ash transition hover:text-bone disabled:opacity-30";

/**
 * A roll's heading on the clip board, and the place it is edited: renamed and
 * described in place, moved up or down among the rolls, deleted when empty. Kept
 * on the heading rather than in a section of its own, so a roll is managed where
 * its clips are.
 */
export function RollHeading({
  name,
  description,
  count,
  first,
  last,
  busy,
  onSave,
  onMove,
  onDelete,
}: {
  name: string;
  description: string;
  count: number;
  first: boolean;
  last: boolean;
  busy: boolean;
  onSave: (draft: Draft) => Promise<boolean>;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <RollFields
        initial={{ name, description }}
        busy={busy}
        submitLabel="Save"
        onSubmit={async (draft) => {
          if (await onSave(draft)) setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 className="text-sm text-bone">
        {name} <span className="font-mono text-xs text-ash">({count})</span>
      </h3>
      {description ? (
        // A middle dot, the separator the clip rows beneath already use, so the
        // count and the description read as two things rather than one run.
        <span className="min-w-0 truncate font-mono text-xs text-ash">
          <span aria-hidden className="mr-3">
            ·
          </span>
          {description}
        </span>
      ) : null}

      <div className="ml-auto flex shrink-0 gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(true)}
          className={CONTROL}
        >
          Edit
        </button>
        <button
          type="button"
          aria-label={`Move the ${name} roll up`}
          disabled={busy || first}
          onClick={() => onMove(-1)}
          className={CONTROL}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move the ${name} roll down`}
          disabled={busy || last}
          onClick={() => onMove(1)}
          className={CONTROL}
        >
          ↓
        </button>
        <button
          type="button"
          // Disabled rather than refused after a click: the reason is known up
          // front, and deleteRoll re-checks it regardless.
          disabled={busy || count > 0}
          title={count > 0 ? "Move its clips to another roll first" : undefined}
          onClick={() => {
            if (window.confirm(`Delete the roll "${name}"?`)) onDelete();
          }}
          className={`${CONTROL} text-red-400 hover:text-red-300`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * The foot of the board: a button until it is wanted, so an empty form does not
 * sit under the clips on every visit. The anchor is what the video form links
 * to when there is no roll to pick.
 */
export function NewRoll({
  busy,
  startOpen,
  onAdd,
}: {
  busy: boolean;
  /** With no rolls at all there is nothing else to do here, so skip the click. */
  startOpen: boolean;
  onAdd: (draft: Draft) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(startOpen);

  return (
    <div id="new-roll" className="scroll-mt-6">
      {open ? (
        <RollFields
          initial={{ name: "", description: "" }}
          busy={busy}
          submitLabel="Add roll"
          onSubmit={async (draft) => {
            // Closing unmounts the fields, so the next roll starts from a blank form.
            if (await onAdd(draft)) setOpen(false);
          }}
          onCancel={startOpen ? undefined : () => setOpen(false)}
        />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={CONTROL}>
          + New roll
        </button>
      )}
    </div>
  );
}

function RollFields({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: Draft) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel?.();
      }}
      className="mb-2 flex flex-wrap items-center gap-2"
    >
      <input
        // Opened on purpose, so the cursor should already be in it.
        autoFocus
        className={`${FIELD} min-w-0 flex-1 basis-40 py-1.5 text-sm`}
        aria-label="Roll name"
        placeholder="Roll name (e.g. Travel)"
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
      />
      <input
        className={`${FIELD} min-w-0 flex-[2] basis-56 py-1.5 text-sm`}
        aria-label="Roll description"
        placeholder="Description (optional)"
        value={draft.description}
        onChange={(event) =>
          setDraft({ ...draft, description: event.target.value })
        }
      />
      <div className="flex shrink-0 gap-1">
        <button
          type="submit"
          disabled={busy || !draft.name.trim()}
          className={`${CONTROL} border-gold text-gold hover:text-gold`}
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={CONTROL}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
