"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteRoll,
  reorderRolls,
  reorderVideos,
  saveRoll,
} from "@/app/admin/videos/actions";
import { NewRoll, RollHeading } from "./RollHeading";
import { gapAt, isNoop, moveBetween, type Slot } from "@/lib/video/board";

export interface VideoRow {
  id: string;
  title: string;
  description: string;
  posterImageUrl: string;
  spriteFrames: number;
  tags: string[];
}

export interface VideoGroup {
  /** Null for clips older than rolls — a place to drag *from*, never *to*. */
  rollId: string | null;
  name: string;
  description: string;
  videos: VideoRow[];
}

/** Identity of the board as rendered by the server, for the sync check below. */
function signatureOf(groups: VideoGroup[]): string {
  return groups
    .map(
      (group) =>
        `${group.rollId}:${group.name}:${group.description}=` +
        group.videos.map((v) => `${v.id}:${v.title}`).join(","),
    )
    .join("|");
}

function sameSlot(a: Slot | null, b: Slot) {
  return a !== null && a.group === b.group && a.index === b.index;
}

/**
 * Every roll's clips as one drag-and-drop board, with the rolls themselves
 * edited on their headings and added at the foot: drag along a roll to reorder
 * it, or onto another roll — empty ones included — to move the clip there. The
 * board is optimistic — rows rearrange on drop and the write happens after,
 * because waiting for a round trip before showing the new position makes
 * dragging feel broken.
 */
export function VideoList({ groups }: { groups: VideoGroup[] }) {
  const [lists, setLists] = useState(groups);
  const [dragging, setDragging] = useState<Slot | null>(null);
  const [over, setOver] = useState<Slot | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // useState only reads its argument on mount, so without this the board would
  // keep showing the rows it was first given — a video saved by the form above
  // would not appear until a manual reload. Compared by signature rather than by
  // reference because the parent rebuilds the array on every render, and an
  // identity check would reset the order mid-drag.
  const [syncedTo, setSyncedTo] = useState(() => signatureOf(groups));
  const signature = signatureOf(groups);
  if (signature !== syncedTo) {
    // Setting state during render is the supported way to adjust state when
    // props change; React re-runs this component before touching the DOM.
    setSyncedTo(signature);
    setLists(groups);
  }

  async function move(from: Slot, to: Slot) {
    const rollId = lists[to.group].rollId;
    // Nowhere to write it: "not on a roll" is a state to leave, not to enter.
    if (!rollId || isNoop(from, to)) return;

    const previous = lists;
    const moved = moveBetween(
      lists.map((group) => group.videos),
      from,
      to,
    );
    const next = lists.map((group, index) => ({
      ...group,
      videos: moved[index],
    }));
    setLists(next);
    setStatus(
      from.group === to.group
        ? "Saving order…"
        : `Moving to ${lists[to.group].name}…`,
    );

    // Only the destination is written: see reorderVideos.
    const result = await reorderVideos(
      rollId,
      next[to.group].videos.map((row) => row.id),
    );
    if (result.error) {
      // Put the old board back rather than leaving the screen disagreeing with
      // the database.
      setLists(previous);
      setStatus(result.error);
      return;
    }
    setStatus(
      from.group === to.group
        ? "Order saved"
        : `Moved to ${lists[to.group].name}`,
    );
  }

  /**
   * Roll edits are not optimistic, unlike drags: a rename or a new roll is a
   * single click with nothing to feel sluggish, and waiting for the server's
   * version means the board never shows a roll the database refused.
   */
  async function run(label: string, action: () => Promise<{ error?: string }>) {
    setBusy(true);
    setStatus(`${label}…`);
    const result = await action();
    setBusy(false);
    setStatus(result.error ?? "");
    if (!result.error) router.refresh();
    return !result.error;
  }

  /** Swaps a roll with its neighbour. The unfiled list is never among them. */
  function moveRoll(group: number, delta: -1 | 1) {
    const ids = lists.flatMap((entry) => (entry.rollId ? [entry.rollId] : []));
    const from = ids.indexOf(lists[group].rollId!);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void run("Saving roll order", () => reorderRolls(ids));
  }

  function endDrag() {
    setDragging(null);
    setOver(null);
  }

  /**
   * Props that make an element a drop target. `gapFor` turns the pointer into
   * the gap it is pointing at: a row asks which half of it the pointer is over,
   * the list itself only ever means its end.
   */
  function dropTarget(
    group: number,
    gapFor: (event: React.DragEvent) => number,
  ) {
    // No handlers at all on the unfiled list, so the browser shows the drop as
    // refused rather than accepting it and then doing nothing.
    if (!lists[group].rollId) return {};
    return {
      onDragOver: (event: React.DragEvent) => {
        // Without preventDefault the drop event never fires.
        event.preventDefault();
        // Kept off the enclosing list, whose own end gap would otherwise win.
        event.stopPropagation();
        const slot = { group, index: gapFor(event) };
        if (!sameSlot(over, slot)) setOver(slot);
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const from = dragging;
        const to = { group, index: gapFor(event) };
        endDrag();
        if (from) void move(from, to);
      },
    };
  }

  /** Where a row sits relative to the pending drop, for the gold insertion line. */
  function marker(group: number, index: number, last: boolean) {
    if (!over || !dragging || over.group !== group || isNoop(dragging, over))
      return "";
    // Box shadows rather than borders, so the line appears without shifting
    // every row under the pointer by 2px mid-drag.
    if (over.index === index) return "shadow-[inset_0_2px_0_var(--color-gold)]";
    if (last && over.index === index + 1)
      return "shadow-[inset_0_-2px_0_var(--color-gold)]";
    return "";
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="-mb-4 text-xs text-ash">
        Drag a row to reorder its roll, or onto another roll to move it there
        {status ? ` · ${status}` : ""}
      </p>

      {lists.length === 0 ? (
        <p className="text-sm text-ash">No rolls or videos yet.</p>
      ) : null}

      {lists.map((group, groupIndex) => {
        const length = group.videos.length;
        const crossing =
          dragging !== null && dragging.group !== groupIndex && group.rollId;

        return (
          <div key={group.rollId ?? "unfiled"}>
            {group.rollId ? (
              <RollHeading
                name={group.name}
                description={group.description}
                count={length}
                first={groupIndex === 0}
                last={!lists[groupIndex + 1]?.rollId}
                busy={busy}
                onSave={(draft) =>
                  run("Saving roll", () =>
                    saveRoll({ id: group.rollId!, ...draft }),
                  )
                }
                onMove={(delta) => moveRoll(groupIndex, delta)}
                onDelete={() =>
                  void run("Deleting roll", () => deleteRoll(group.rollId!))
                }
              />
            ) : (
              <h3 className="mb-2 text-sm text-amber-400">
                {group.name}{" "}
                <span className="font-mono text-xs text-ash">({length})</span>
              </h3>
            )}

            {/* The whole list is a target for its own end slot, so a drop in the
                gap under the last row — or anywhere on an empty roll — lands. */}
            <ul
              {...dropTarget(groupIndex, () => length)}
              className={`flex flex-col divide-y divide-hairline rounded transition ${
                crossing
                  ? "outline-1 outline-offset-4 outline-hairline outline-dashed"
                  : ""
              } ${crossing && over?.group === groupIndex ? "outline-gold" : ""}`}
            >
              {group.videos.map((video, index) => {
                const slot = { group: groupIndex, index };
                return (
                  <li
                    key={video.id}
                    draggable
                    onDragStart={() => setDragging(slot)}
                    onDragEnd={endDrag}
                    {...dropTarget(groupIndex, (event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      return gapAt(index, event.clientY, box.top, box.height);
                    })}
                    className={`flex cursor-grab items-center gap-3 py-3 transition ${
                      sameSlot(dragging, slot) ? "opacity-40" : ""
                    } ${marker(groupIndex, index, index === length - 1)}`}
                  >
                    <span
                      aria-hidden
                      className="font-mono text-xs text-ash select-none"
                    >
                      ⠿
                    </span>
                    <span className="w-6 shrink-0 font-mono text-xs text-ash">
                      {index + 1}
                    </span>

                    {/* Plain <img>: a tiny admin thumbnail, not worth an
                        optimisation request each. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.posterImageUrl}
                      alt=""
                      className="h-12 w-16 rounded bg-black object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{video.title}</div>
                      <div className="truncate font-mono text-xs text-ash">
                        {[
                          video.description,
                          `${video.spriteFrames} frames`,
                          video.tags.join(", "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>

                    {/* Keyboard equivalent for reordering — drag and drop alone is
                        not reachable without a mouse. Moving between rolls has
                        its own keyboard route: the roll picker on the clip's
                        form. Hidden on the unfiled list, which has no order to
                        save. */}
                    {group.rollId ? (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${video.title} up`}
                          disabled={index === 0}
                          onClick={() =>
                            void move(slot, {
                              group: groupIndex,
                              index: index - 1,
                            })
                          }
                          className="rounded border border-hairline px-2 text-xs text-ash disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${video.title} down`}
                          disabled={index === length - 1}
                          onClick={() =>
                            void move(slot, {
                              group: groupIndex,
                              index: index + 2,
                            })
                          }
                          className="rounded border border-hairline px-2 text-xs text-ash disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    ) : null}

                    <Link
                      href={`/admin/videos/${video.id}`}
                      className="shrink-0 text-sm text-gold"
                    >
                      Edit
                    </Link>
                  </li>
                );
              })}

              {length === 0 ? (
                <li className="py-3 text-xs text-ash">
                  {crossing
                    ? "Drop here to move it onto this roll"
                    : "No clips on this roll yet."}
                </li>
              ) : null}
            </ul>
          </div>
        );
      })}

      <NewRoll
        busy={busy}
        startOpen={!lists.some((group) => group.rollId)}
        onAdd={(draft) => run("Adding roll", () => saveRoll(draft))}
      />
    </div>
  );
}
