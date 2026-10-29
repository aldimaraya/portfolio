"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteLink, reorderLinks, saveLink } from "@/app/admin/links/actions";
import { linkIcon } from "@/lib/links/link";
import { FIELD } from "./fields";

type Row = { id: string; label: string; href: string; profile: boolean };
type Draft = Omit<Row, "id">;

/** The same small bordered buttons as a roll heading's controls. */
const CONTROL =
  "rounded border border-hairline px-2 py-0.5 text-xs text-ash transition hover:text-bone disabled:opacity-30";

/**
 * The links in the site's header and footer, edited in place. Not optimistic,
 * like roll edits: every change is one click, and waiting for the server means
 * the list never shows a link the database refused — or one the URL check
 * rejected, which is the likelier failure here.
 */
export function LinkList({ links }: { links: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(links.length === 0);

  async function run(label: string, action: () => Promise<{ error?: string }>) {
    setBusy(true);
    setStatus(`${label}…`);
    const result = await action();
    setBusy(false);
    setStatus(result.error ?? "");
    if (!result.error) router.refresh();
    return !result.error;
  }

  function move(index: number, delta: -1 | 1) {
    const ids = links.map((link) => link.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    void run("Saving order", () => reorderLinks(ids));
  }

  return (
    <div className="flex flex-col gap-2">
      {links.length === 0 && !adding ? (
        <p className="text-sm text-ash">No links yet.</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {links.map((link, index) =>
          editing === link.id ? (
            <li key={link.id}>
              <LinkFields
                initial={link}
                busy={busy}
                submitLabel="Save"
                onSubmit={async (draft) => {
                  if (await run("Saving", () => saveLink({ id: link.id, ...draft }))) {
                    setEditing(null);
                  }
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={link.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-2"
            >
              <span className="text-sm text-bone">{link.label}</span>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate font-mono text-xs text-ash hover:text-bone"
              >
                {link.href}
              </a>
              <span className="font-mono text-xs text-ash">
                {/* What the site will draw, so an unrecognised host is noticed
                    here rather than by spotting a word among the icons. */}
                {linkIcon(link.href) ? "icon" : "shown as text"}
                {link.profile ? " · profile" : ""}
              </span>

              <div className="ml-auto flex shrink-0 gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(link.id)}
                  className={CONTROL}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Move ${link.label} up`}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                  className={CONTROL}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${link.label} down`}
                  disabled={busy || index === links.length - 1}
                  onClick={() => move(index, 1)}
                  className={CONTROL}
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Remove the ${link.label} link?`)) {
                      void run("Removing", () => deleteLink(link.id));
                    }
                  }}
                  className={`${CONTROL} text-red-400 hover:text-red-300`}
                >
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <LinkFields
          // Most of what goes here is an account, so start from the common case.
          initial={{ label: "", href: "", profile: true }}
          busy={busy}
          submitLabel="Add link"
          onSubmit={async (draft) => {
            // Closing unmounts the fields, so the next link starts from a blank form.
            if (await run("Adding", () => saveLink(draft))) setAdding(false);
          }}
          onCancel={links.length === 0 ? undefined : () => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${CONTROL} self-start`}>
          + New link
        </button>
      )}

      <p role="status" aria-live="polite" className="min-h-4 font-mono text-xs text-ash">
        {status}
      </p>
    </div>
  );
}

function LinkFields({
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
      className="flex flex-wrap items-center gap-2"
    >
      <input
        // Opened on purpose, so the cursor should already be in it.
        autoFocus
        className={`${FIELD} min-w-0 flex-1 basis-32 py-1.5 text-sm`}
        aria-label="Link label"
        placeholder="Label (e.g. YouTube)"
        value={draft.label}
        onChange={(event) => setDraft({ ...draft, label: event.target.value })}
      />
      <input
        type="url"
        className={`${FIELD} min-w-0 flex-[2] basis-64 py-1.5 text-sm`}
        aria-label="Link URL"
        placeholder="https://…"
        value={draft.href}
        onChange={(event) => setDraft({ ...draft, href: event.target.value })}
      />
      <label
        className="flex shrink-0 items-center gap-1.5 text-xs text-ash"
        title="An account that is you — not a shop or a page you merely point at. Profiles are listed to search engines as yours."
      >
        <input
          type="checkbox"
          checked={draft.profile}
          onChange={(event) => setDraft({ ...draft, profile: event.target.checked })}
          className="accent-gold"
        />
        My account
      </label>
      <div className="flex shrink-0 gap-1">
        <button
          type="submit"
          disabled={busy || !draft.label.trim() || !draft.href.trim()}
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
