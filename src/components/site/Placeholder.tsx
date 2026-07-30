/**
 * Scaffolding marker. Every page that is still a stub renders one of these so the
 * site boots and navigates end-to-end before any feature work lands. Delete each
 * usage as its plan task is implemented — and delete this file when none remain.
 */
export function Placeholder({ title, task }: { title: string; task: string }) {
  return (
    <div className="rounded border border-dashed border-goldline bg-frame/40 p-10 text-center">
      <h2 className="text-lg font-semibold tracking-wide uppercase">{title}</h2>
      <p className="mt-2 font-mono text-xs tracking-widest text-gold uppercase">
        not implemented
      </p>
      <p className="mx-auto mt-4 max-w-md text-sm text-ash">
        Scaffolded placeholder. Implement in{' '}
        <span className="font-mono text-bone">{task}</span> of{' '}
        <span className="font-mono text-bone">
          docs/superpowers/plans/2026-07-28-personal-portfolio.md
        </span>
        .
      </p>
    </div>
  );
}
