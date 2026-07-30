import { Placeholder } from '@/components/site/Placeholder';
import { SiteShell } from '@/components/site/SiteShell';

export default async function MotionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;

  return (
    <SiteShell>
      <Placeholder title="Motion — film-strip video reel" task="Task 17" />
    </SiteShell>
  );
}
