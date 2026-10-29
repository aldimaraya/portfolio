'use client';

export const INSPECTOR_MIN = 300;
export const INSPECTOR_MAX = 720;
export const INSPECTOR_DEFAULT = 360;

/**
 * Clamped to fixed bounds only, so it renders the same on the server as in the
 * browser. The window-relative cap is applied while dragging (see `dragCeiling`)
 * — reading the window here would make hydration disagree on a narrow screen.
 */
export function clampInspector(width: number, ceiling = INSPECTOR_MAX): number {
  return Math.round(Math.min(Math.max(width || INSPECTOR_DEFAULT, INSPECTOR_MIN), Math.max(INSPECTOR_MIN, ceiling)));
}

/** Never drag so wide that the grid beside it is squeezed to a column or two. */
function dragCeiling(): number {
  return Math.min(INSPECTOR_MAX, window.innerWidth * 0.6);
}

/**
 * The drag handle on the inspector's left edge (lg and up). While dragging it
 * writes `--inspector-w` straight onto `target` instead of going through React:
 * the grid re-packs itself in CSS as the column widens, and re-rendering every
 * tile on every pointermove would make the drag stutter on a big library. The
 * width only reaches React — and storage — on release.
 */
export function InspectorResizer({
  target,
  width,
  onCommit,
}: {
  target: React.RefObject<HTMLElement | null>;
  width: number;
  onCommit: (width: number) => void;
}) {
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    let current = width;
    handle.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // Switches off the drawer's width transition, which would trail the pointer.
    target.current?.setAttribute('data-resizing', '');

    // The inspector sits to the right, so dragging left widens it.
    const move = (moved: PointerEvent) => {
      current = clampInspector(width + startX - moved.clientX, dragCeiling());
      target.current?.style.setProperty('--inspector-w', `${current}px`);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      target.current?.removeAttribute('data-resizing');
      onCommit(current);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    // Kept from the page's own ←/→, which would step to another photo.
    event.preventDefault();
    event.stopPropagation();
    onCommit(clampInspector(width + (event.key === 'ArrowLeft' ? 24 : -24), dragCeiling()));
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the photo panel"
      aria-valuenow={width}
      aria-valuemin={INSPECTOR_MIN}
      aria-valuemax={INSPECTOR_MAX}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(INSPECTOR_DEFAULT)}
      // Zero-width in the layout: it straddles the panel's border rather than
      // taking a strip of its own.
      className="group sticky top-0 z-10 -mr-1.5 -ml-1.5 hidden h-dvh w-3 shrink-0 cursor-col-resize touch-none outline-none lg:block"
    >
      <span className="mx-auto block h-full w-px bg-transparent transition group-hover:bg-gold/60 group-focus-visible:bg-gold group-active:bg-gold" />
    </div>
  );
}
