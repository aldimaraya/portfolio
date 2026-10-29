/**
 * The frame every admin page sits in: a header with the page's name and count,
 * room on the right for its own controls, and a padded body. `bleed` drops the
 * body padding for pages that lay out their own panes (Stills, Motion).
 */
export function AdminPage({
  title,
  count,
  actions,
  bleed = false,
  children,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  bleed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-hairline px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 md:px-6">
        <h1 className="text-2xl font-bold md:text-xl md:font-semibold">
          {title}
          {count === undefined ? null : <span className="ml-2 font-normal text-ash">{count}</span>}
        </h1>
        {actions}
      </header>
      {bleed ? children : <div className="flex-1 px-4 py-6 md:px-6 md:py-8">{children}</div>}
    </div>
  );
}
