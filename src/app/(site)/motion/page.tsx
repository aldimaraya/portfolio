import { Placeholder } from '@/components/site/Placeholder';

export default async function MotionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;

  return <Placeholder title="Motion — film-strip video reel" task="Task 17" />;
}
