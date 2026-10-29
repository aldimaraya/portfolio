import Link from 'next/link';
import { db } from '@/lib/db';
import { listTagNames } from '@/lib/tags';
import { listPhotoLocations } from '@/lib/photo/facets';
import { PhotoForm } from '@/components/admin/PhotoForm';
import { VideoForm } from '@/components/admin/VideoForm';
import { AdminPage } from '@/components/admin/shell/AdminPage';

export const dynamic = 'force-dynamic';

/**
 * Where "Add media" lands. For now it hosts the existing one-at-a-time forms,
 * moved off the Stills and Motion pages so those can be libraries; the
 * multi-file queue replaces both forms here.
 */
export default async function AddMediaPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const kind = (await searchParams).kind === 'clip' ? 'clip' : 'still';
  const [tagOptions, locationOptions, rolls] = await Promise.all([
    listTagNames(),
    kind === 'still' ? listPhotoLocations() : Promise.resolve([]),
    kind === 'clip'
      ? db.roll.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <AdminPage
      title="Add media"
      actions={
        <div role="group" aria-label="Kind" className="flex gap-1 rounded-lg border border-hairline bg-film p-[3px] text-xs md:ml-auto">
          {(['still', 'clip'] as const).map((option) => (
            <Link
              key={option}
              href={option === 'clip' ? '/admin/add?kind=clip' : '/admin/add'}
              aria-current={option === kind ? 'page' : undefined}
              className={`flex h-7 items-center rounded-md px-3 ${option === kind ? 'bg-frame text-bone' : 'text-ash hover:text-bone'}`}
            >
              {option === 'still' ? 'Still' : 'Clip'}
            </Link>
          ))}
        </div>
      }
    >
      <div className="max-w-3xl">
        {kind === 'still' ? (
          <PhotoForm tagOptions={tagOptions} locationOptions={locationOptions} />
        ) : (
          <VideoForm tagOptions={tagOptions} rolls={rolls} />
        )}
      </div>
    </AdminPage>
  );
}
