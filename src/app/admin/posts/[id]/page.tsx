import { Placeholder } from '@/components/site/Placeholder';

export default async function AdminPostEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Placeholder title={`Edit post — ${id}`} task="Task 13" />;
}
