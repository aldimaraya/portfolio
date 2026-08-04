/**
 * A clip's running time, as it is written on the roll.
 *
 * Zero means unknown rather than instantaneous: every clip stored before
 * Video.durationSeconds existed carries the column default, and a roll that
 * announced them all as "0:00" would be stating something false with more
 * confidence than a blank. Callers render null as nothing at all.
 */
export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  // Rounded, not floored. A 59.6s clip is a minute to anyone watching it, and
  // flooring would label it 0:59 while the player's own timeline says 1:00.
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  // Hours get their own field rather than running the minutes past 60: "1:04:09"
  // is a length, "64:09" is a number that has to be converted before it means
  // anything. Nothing here is that long yet, but the format should not be the
  // reason it cannot be.
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * The roll's total running time, in the same format. Clips of unknown length are
 * skipped rather than counted as zero, so the total is a floor and not a lie —
 * which is also why the caller is told how many were left out.
 */
export function rollDuration(durations: number[]): { total: string | null; unknown: number } {
  const known = durations.filter((seconds) => Number.isFinite(seconds) && seconds > 0);
  return {
    total: formatDuration(known.reduce((sum, seconds) => sum + seconds, 0)),
    unknown: durations.length - known.length,
  };
}
