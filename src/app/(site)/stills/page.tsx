import { Placeholder } from '@/components/site/Placeholder';

// searchParams is a Promise in Next 16 and must be awaited. Task 16 reads the
// camera/location/tag filters from it via filtersFromSearchParams.
export default async function StillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;

  return <Placeholder title="Stills — colour-sorted photo wall" task="Tasks 15–16" />;
}
