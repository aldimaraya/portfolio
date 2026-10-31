'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteLink, reorderLinks, saveLink } from '@/app/admin/links/actions';
import { LinkMark } from '@/components/site/SiteLinks';
import { ICON_NAMES, linkIcon } from '@/lib/links/link';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';
import { gapAt, isNoop, moveBetween } from '@/lib/video/board';
import { FIELD, GHOST_BUTTON, GOLD_BUTTON, LABEL } from '../fields';
import { AdminPage } from '../shell/AdminPage';
import { Icon } from '../shell/Icon';

export type Row = { id: string; label: string; href: string; profile: boolean };
type Draft = Omit<Row, 'id'>;

/** The row being edited: an existing link's id, or a new one not yet saved. */
const NEW = 'new';

/**
 * The links in the site's header and footer, edited in place beside a preview
 * of both. Ordering is optimistic, as on the Motion board — a drag that waits a
 * round trip before the row lands feels broken — but saving a link is not: the
 * likeliest failure is the URL check refusing the address, and the list should
 * never show a link the server turned down.
 */
export function LinkBoard({ links }: { links: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(links);
  const [editing, setEditing] = useState<string | null>(links.length === 0 ? NEW : null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  // useState only reads its argument on mount, so the server's list after a
  // save or delete has to be taken in by hand; compared by content because the
  // page builds a new array on every render.
  const signature = JSON.stringify(links);
  const [syncedTo, setSyncedTo] = useState(signature);
  if (signature !== syncedTo) {
    setSyncedTo(signature);
    setRows(links);
  }

  function open(id: string) {
    const row = rows.find((link) => link.id === id);
    setDraft(row ? { label: row.label, href: row.href, profile: row.profile } : blank());
    setError('');
    setEditing(id);
  }

  function close() {
    // With nothing saved yet the form is the whole page; it has nowhere to close to.
    if (rows.length === 0) return;
    setEditing(null);
    setError('');
  }

  async function save() {
    setBusy(true);
    setError('');
    const result = await saveLink(editing === NEW ? draft : { id: editing!, ...draft });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(null);
    setStatus(editing === NEW ? 'Link added' : 'Link saved');
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const result = await deleteLink(id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(null);
    setStatus('Link removed');
    router.refresh();
  }

  /** `to` is a gap, as on the Motion board: 0 above the first row, rows.length below the last. */
  async function move(from: number, to: number) {
    if (isNoop({ group: 0, index: from }, { group: 0, index: to })) return;
    const previous = rows;
    const [next] = moveBetween([rows], { group: 0, index: from }, { group: 0, index: to });
    setRows(next);
    setStatus('Saving order…');
    const result = await reorderLinks(next.map((link) => link.id));
    if (result.error) {
      // Put the old order back rather than leave the screen disagreeing with the database.
      setRows(previous);
      setStatus(result.error);
      return;
    }
    setStatus('Order saved');
  }

  function endDrag() {
    setDragging(null);
    setOver(null);
  }

  /** Where the gold insertion line sits for a pending drop. */
  function marker(index: number): string {
    if (dragging === null || over === null || isNoop({ group: 0, index: dragging }, { group: 0, index: over })) {
      return '';
    }
    // Box shadows rather than borders, so the line appears without shifting rows.
    if (over === index) return 'shadow-[inset_0_3px_0_var(--color-gold)]';
    if (index === rows.length - 1 && over === index + 1) return 'shadow-[inset_0_-3px_0_var(--color-gold)]';
    return '';
  }

  // What the preview draws: the list as it stands, with the open form's draft in
  // place of the row it edits, or after the rest when it is a new one.
  const preview: (Draft & { key: string; editing: boolean })[] = rows.map((link) =>
    link.id === editing ? { ...draft, key: link.id, editing: true } : { ...link, key: link.id, editing: false },
  );
  if (editing === NEW) preview.push({ ...draft, key: NEW, editing: true });
  const reorderable = editing === null && rows.length > 1;

  const form =
    editing === null ? null : (
      <LinkForm
        draft={draft}
        isNew={editing === NEW}
        busy={busy}
        error={error}
        canCancel={rows.length > 0}
        onChange={setDraft}
        onSave={save}
        onCancel={close}
        onDelete={editing === NEW ? undefined : () => remove(editing)}
      />
    );

  return (
    <AdminPage
      title={
        <span className="flex flex-col gap-1">
          <span>
            Links<span className="ml-2 font-normal text-ash">{rows.length}</span>
          </span>
          <span className="text-xs font-normal text-ash">Beside your name on every page, and in the footer</span>
        </span>
      }
      actions={
        <button
          type="button"
          disabled={editing === NEW}
          onClick={() => open(NEW)}
          className={`${GHOST_BUTTON} ml-auto gap-2`}
        >
          <Icon name="plus" size={14} />
          Add link
        </button>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-hairline bg-film">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3 text-xs text-ash md:px-5">
            <span className="max-md:hidden">Drag to reorder · ⌥↑/↓ nudges the focused row</span>
            <span className="md:hidden">⌥↑/↓ or drag to reorder</span>
            {status ? (
              <span role="status" className="ml-auto flex items-center gap-1.5 text-[#7fc49a]">
                {status.endsWith('…') ? null : <Icon name="check" size={14} />}
                {status}
              </span>
            ) : null}
          </div>

          <ol>
            {rows.map((link, index) =>
              link.id === editing ? (
                <li key={link.id} className="border-t border-white/6 first:border-t-0">
                  {form}
                </li>
              ) : (
                <li
                  key={link.id}
                  draggable={reorderable}
                  onDragStart={() => setDragging(index)}
                  onDragEnd={endDrag}
                  onDragOver={(event) => {
                    if (dragging === null) return;
                    // Without preventDefault the drop event never fires.
                    event.preventDefault();
                    const box = event.currentTarget.getBoundingClientRect();
                    const gap = gapAt(index, event.clientY, box.top, box.height);
                    if (gap !== over) setOver(gap);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = dragging;
                    const to = over;
                    endDrag();
                    if (from !== null && to !== null) void move(from, to);
                  }}
                  onKeyDown={(event) => {
                    if (!reorderable || !event.altKey) return;
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    // Gaps, not rows: one down is the gap below the next row.
                    const to = event.key === 'ArrowUp' ? index - 1 : index + 2;
                    if (to >= 0 && to <= rows.length) void move(index, to);
                  }}
                  className={`flex min-h-[60px] items-center gap-3 border-t border-white/6 px-4 py-2 transition-opacity first:border-t-0 md:gap-3.5 md:px-5 ${
                    dragging === index ? 'opacity-40' : ''
                  } ${marker(index)}`}
                >
                  {/* A grip, not a button: Firefox will not start a drag from a
                      button. The keyboard way to move a row is ⌥↑/↓ from its Edit
                      button, which the key handler above catches. */}
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-6 shrink-0 items-center justify-center text-ash select-none ${
                      reorderable ? 'md:cursor-grab' : 'opacity-30'
                    }`}
                  >
                    ⠿
                  </span>
                  <Tile href={link.href} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">{link.label}</span>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      draggable={false}
                      className="truncate font-mono text-xs text-ash hover:text-bone"
                    >
                      {link.href.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  </span>
                  {/* What the site will draw, so an unrecognised host is noticed
                      here rather than by spotting a word among the icons. */}
                  {linkIcon(link.href) ? null : (
                    <span className="text-[11px] text-ash max-md:hidden">No icon — shown as its label</span>
                  )}
                  {link.profile ? (
                    <span className="flex h-[22px] shrink-0 items-center rounded-full bg-gold/14 px-2 text-[11px] text-gold">
                      Profile
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={editing !== null}
                    onClick={() => open(link.id)}
                    aria-label={`Edit ${link.label}`}
                    aria-keyshortcuts={reorderable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
                    className="h-8 shrink-0 rounded-md border border-white/14 px-2.5 text-xs text-[#d0d0d4] transition hover:border-gold disabled:opacity-40"
                  >
                    Edit
                  </button>
                </li>
              ),
            )}
            {editing === NEW ? <li className="border-t border-white/6 first:border-t-0">{form}</li> : null}
          </ol>
        </section>

        <Preview links={preview} />
      </div>
    </AdminPage>
  );
}

function blank(): Draft {
  // Most of what goes here is an account, so start from the common case.
  return { label: '', href: '', profile: true };
}

/** The mark the site will draw for an address, or a dashed "Aa" where it will print the label. */
function Tile({ href, open = false }: { href: string; open?: boolean }) {
  const icon = linkIcon(href);
  if (!icon) {
    return (
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 font-mono text-[10px] text-ash"
      >
        Aa
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-bone ${open ? 'bg-white/10' : 'bg-frame'}`}
    >
      <LinkMark icon={icon} className="h-4 w-auto max-w-5" />
    </span>
  );
}

/** The fields replace the row in place; nothing opens on top of the list. */
function LinkForm({
  draft,
  isNew,
  busy,
  error,
  canCancel,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Draft;
  isNew: boolean;
  busy: boolean;
  error: string;
  canCancel: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const icon = linkIcon(draft.href);
  const id = isNew ? 'link-new' : 'link-edit';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      className="flex flex-col gap-3.5 bg-[#1a1a1d] px-4 py-4 shadow-[inset_2px_0_0_var(--color-gold)] md:px-5"
    >
      <div className="flex items-center gap-3.5">
        <span className="w-6 shrink-0 max-md:hidden" />
        <Tile href={draft.href} open />
        <span className="text-sm text-ash">
          {isNew && !draft.href.trim()
            ? 'New link'
            : icon
              ? `${ICON_NAMES[icon]} · icon found from the address`
              : 'No icon for this address — shown as its label'}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 md:pl-[38px]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-label`} className={`${LABEL} text-[10px]`}>
            Label
          </label>
          <input
            id={`${id}-label`}
            // Opened on purpose, so the cursor should already be in it.
            autoFocus
            className={`${FIELD} h-[38px] py-0 text-sm`}
            placeholder="YouTube"
            value={draft.label}
            onChange={(event) => onChange({ ...draft, label: event.target.value })}
          />
          <span className="text-[11px] text-ash">Read aloud and shown on hover</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-href`} className={`${LABEL} text-[10px]`}>
            Address
          </label>
          <input
            id={`${id}-href`}
            type="url"
            className={`${FIELD} h-[38px] py-0 font-mono text-xs`}
            placeholder="https://…"
            value={draft.href}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => onChange({ ...draft, href: event.target.value })}
          />
          <span className="text-[11px] text-ash">A full web address. Share-tracking parameters are removed.</span>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 md:pl-[38px]">
        <input
          type="checkbox"
          checked={draft.profile}
          onChange={(event) => onChange({ ...draft, profile: event.target.checked })}
          className="mt-0.5 size-[18px] shrink-0 accent-gold"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">This account is me</span>
          <span className="text-xs text-ash">
            Marks it rel=&quot;me&quot; and lists it as you to search engines. Leave off for a shop or a print lab.
          </span>
        </span>
      </label>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-400 md:pl-[38px]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 md:pl-[38px]">
        <button
          type="submit"
          disabled={busy || !draft.label.trim() || !draft.href.trim()}
          className={GOLD_BUTTON}
        >
          {busy ? 'Saving…' : isNew ? 'Add link' : 'Save'}
        </button>
        {canCancel ? (
          <button type="button" onClick={onCancel} className={GHOST_BUTTON}>
            Cancel
          </button>
        ) : null}
        {onDelete ? (
          confirming ? (
            <span className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-ash">Remove it from every page?</span>
              <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className="h-9 rounded-md bg-red-500/15 px-3 text-red-300 transition hover:bg-red-500/25"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="h-9 px-2 text-ash hover:text-bone">
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="ml-auto h-9 rounded-md px-3 text-sm text-[#f08a80] transition hover:bg-red-500/10"
            >
              Delete
            </button>
          )
        ) : null}
      </div>
    </form>
  );
}

/**
 * The header and footer as they will draw these links, re-drawn from the list
 * as it stands — the draft included — so a new mark or a reorder is seen before
 * it is saved. The link being edited is outlined.
 */
function Preview({ links }: { links: (Draft & { key: string; editing: boolean })[] }) {
  const shown = links.filter((link) => link.label.trim() || link.href.trim());
  const outline = 'rounded-[4px] outline outline-1 outline-offset-2 outline-gold text-bone';

  const marks = shown.map((link) => {
    const icon = linkIcon(link.href);
    return (
      <span key={link.key} className={`inline-flex items-center ${link.editing ? outline : ''}`} title={link.label}>
        {icon ? (
          <LinkMark icon={icon} className="h-4 w-auto" />
        ) : (
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase">{link.label || '…'}</span>
        )}
      </span>
    );
  });

  return (
    <aside aria-label="How the links appear" className="flex min-w-0 flex-col gap-4">
      <h2 className={LABEL}>On the site</h2>

      <figure className="overflow-hidden rounded-xl border border-hairline">
        <figcaption className="border-b border-hairline bg-film px-3 py-2 text-[11px] text-ash">Header</figcaption>
        <div className="flex flex-col gap-1 bg-[#050506] px-[18px] py-[18px]">
          <span className="text-[15px] tracking-[0.02em]">{SITE_NAME}</span>
          <span className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs text-ash">
            <span>{SITE_TAGLINE}</span>
            {marks}
          </span>
        </div>
      </figure>

      <figure className="overflow-hidden rounded-xl border border-hairline">
        <figcaption className="border-b border-hairline bg-film px-3 py-2 text-[11px] text-ash">Footer</figcaption>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2.5 bg-[#050506] px-[18px] py-4 text-ash">
          {marks.length ? marks : <span className="text-xs">No links — the footer shows none.</span>}
        </div>
      </figure>

      <p className="text-xs leading-relaxed text-ash">
        YouTube, GitHub, Instagram and Vimeo addresses get their icon automatically; anything else is shown as its
        label. The link being edited is outlined.
      </p>
    </aside>
  );
}
