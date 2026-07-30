import { Placeholder } from '@/components/site/Placeholder';

export default async function AdminVideoEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Placeholder title={`Edit video — ${id}`} task="Task 12" />;
}
