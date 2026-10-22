'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Where the selected block's toolbar is drawn: a row of the editor's sticky top
 * bar, provided by PostEditor. A toolbar floating above its block covered the
 * block before it, and on a tall carousel scrolled out of reach; up there it is
 * always in view and never over the writing.
 */
export const ToolbarSlot = createContext<HTMLElement | null>(null);

/**
 * The selected block's controls: its own first, then move and delete, which
 * every block has.
 */
export function BlockToolbar({
  label,
  children,
  onUp,
  onDown,
  onDelete,
}: {
  label: string;
  children?: ReactNode;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const slot = useContext(ToolbarSlot);
  if (!slot) return null;

  return createPortal(
    <div role="toolbar" aria-label={`${label} options`} className="editor-toolbar">
      <span className="editor-toolbar-label">{label}</span>
      {children ? <div className="editor-toolbar-group">{children}</div> : null}
      <div className="editor-toolbar-group">
        <ToolButton label="Move up" onClick={onUp}>
          <Arrow d="M12 19V5M5 12l7-7 7 7" />
        </ToolButton>
        <ToolButton label="Move down" onClick={onDown}>
          <Arrow d="M12 5v14M19 12l-7 7-7-7" />
        </ToolButton>
        <ToolButton label="Delete block" onClick={onDelete}>
          <Arrow d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </ToolButton>
      </div>
    </div>,
    slot,
  );
}

export function ToolGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="editor-toolbar-group">
      {children}
    </div>
  );
}

export function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // Keeps the selection in a text field when a format button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={typeof children === 'string' ? undefined : label}
      aria-pressed={active}
      className="editor-tool"
      data-active={active || undefined}
    >
      {children}
    </button>
  );
}

/** A choice of one, e.g. a photo block's layout. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <ToolGroup label={label}>
      {options.map(([option, text]) => (
        <ToolButton key={option} label={text} active={value === option} onClick={() => onChange(option)}>
          {text}
        </ToolButton>
      ))}
    </ToolGroup>
  );
}

function Arrow({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
