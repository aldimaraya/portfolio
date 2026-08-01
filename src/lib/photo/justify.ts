/**
 * Row packing for the polaroid wall.
 *
 * Each frame's width follows from its own aspect ratio at a shared row height,
 * so a row is filled by choosing the height at which its photos exactly span the
 * container. Greedy: keep adding photos to the row until doing so would push the
 * fitted height below the target, then commit the row at that height.
 *
 * Pure — no DOM. The caller measures the container and hands the width in.
 */

export interface JustifyItem {
  id: string;
  /** width / height of the photo itself, upright. */
  ratio: number;
}

export interface PlacedItem extends JustifyItem {
  /** Height of the image area, shared by every frame in the row. */
  height: number;
  /** Width of the image area. The card adds `padding` on top of this. */
  width: number;
}

export interface JustifyOptions {
  /** Height a row aims for before it is stretched or squeezed to fit. */
  targetHeight: number;
  /** Horizontal space between two cards. */
  gap: number;
  /** Total horizontal padding a card adds around its image. */
  padding: number;
}

/**
 * The shared image height at which `ratios` exactly span `containerWidth`.
 * Chrome-free arithmetic: the fixed costs (padding per card, gaps between them)
 * come off the width first, and what remains is divided by the summed ratios.
 */
function fittedHeight(
  ratios: number[],
  containerWidth: number,
  { gap, padding }: JustifyOptions,
): number {
  const fixed = ratios.length * padding + Math.max(0, ratios.length - 1) * gap;
  const available = containerWidth - fixed;
  const totalRatio = ratios.reduce((sum, ratio) => sum + ratio, 0);
  if (available <= 0 || totalRatio <= 0) return 0;
  return available / totalRatio;
}

function place(row: JustifyItem[], height: number): PlacedItem[] {
  return row.map((item) => ({
    ...item,
    height,
    // Rounded per item rather than accumulated, so a row is never a pixel or two
    // wide and forced to wrap — the browser would drop the last card to its own
    // line and undo the packing.
    width: Math.max(1, Math.floor(item.ratio * height)),
  }));
}

/**
 * Packs `items` into justified rows. Every row but the last spans the container
 * exactly; the last keeps the target height rather than stretching a handful of
 * photos across the full width.
 */
export function justifyRows(
  items: JustifyItem[],
  containerWidth: number,
  options: JustifyOptions,
): PlacedItem[][] {
  const { targetHeight } = options;

  // Before the container has been measured there is nothing to justify against.
  // Falling back to the target height renders a sane wall rather than a
  // collapsed one, and the first real measurement replaces it.
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return items.length ? [place(items, targetHeight)] : [];
  }

  const rows: PlacedItem[][] = [];
  let current: JustifyItem[] = [];

  for (const item of items) {
    // A non-positive ratio would poison the row's sum and blow up the fitted
    // height, so treat a photo with missing dimensions as square.
    const safe = { ...item, ratio: item.ratio > 0 ? item.ratio : 1 };
    current.push(safe);

    const height = fittedHeight(
      current.map((entry) => entry.ratio),
      containerWidth,
      options,
    );

    // The row now holds enough that fitting it exactly means going no taller
    // than the target — that is the point to commit it.
    if (height > 0 && height <= targetHeight) {
      rows.push(place(current, height));
      current = [];
    }
  }

  if (current.length) {
    // The trailing row is under-full, so it is never stretched past the target —
    // a lone panorama would otherwise blow up to the full width and tower over
    // every row above it. A nearly-full last row still closes up neatly, since
    // its fitted height already lands at roughly the target.
    const height = fittedHeight(
      current.map((entry) => entry.ratio),
      containerWidth,
      options,
    );
    const fitted = height > 0 ? Math.min(height, targetHeight) : targetHeight;
    rows.push(place(current, Math.max(1, fitted)));
  }

  return rows;
}
