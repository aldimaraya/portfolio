const FORMATS = {
  full: { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
  /** The day alone, for lists where the hour is noise (a subscriber's join date). */
  day: { day: 'numeric', month: 'short', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * A date in the admin's own timezone. The server renders in UTC, so the text is
 * replaced after hydration — suppressHydrationWarning covers that one swap.
 */
export function LocalTime({ value, format = 'full' }: { value: string; format?: keyof typeof FORMATS }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Date(value).toLocaleString(undefined, FORMATS[format])}
    </time>
  );
}
