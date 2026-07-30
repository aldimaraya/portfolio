import { Placeholder } from '@/components/site/Placeholder';
import { SiteShell } from '@/components/site/SiteShell';

// params is a Promise in Next 16 and must be awaited.
export default async function JournalPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <SiteShell>
      <Placeholder title={`Journal post — ${slug}`} task="Task 18" />
    </SiteShell>
  );
}
