import Link from 'next/link';
import { db } from '@/lib/db';
import { listTagNames } from '@/lib/tags';
import { listPhotoLocations } from '@/lib/photo/facets';
import { PhotoForm } from '@/components/admin/PhotoForm';
import { LABEL } from '@/components/admin/fields';
import { summarizeSettings, toSettings } from '@/lib/photo/settings';

export const dynamic = 'force-dynamic';

export default async function AdminPhotosPage() {
  const [photos, tagOptions, locationOptions] = await Promise.all([
    db.photo.findMany({
      orderBy: { createdAt: 'desc' },
      include: { tags: { include: { tag: true } } },
    }),
    listTagNames(),
    listPhotoLocations(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className={`mb-4 ${LABEL}`}>Add a photo</h2>
        <PhotoForm tagOptions={tagOptions} locationOptions={locationOptions} />
      </section>

      <section>
        <h2 className={`mb-4 ${LABEL}`}>All photos ({photos.length})</h2>
        <ul className="flex flex-col divide-y divide-hairline">
          {photos.map((photo) => (
            <li key={photo.id} className="flex items-center gap-4 py-3">
              {/* Plain <img>: these are tiny admin thumbnails, not worth an
                  optimisation request each. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.imageUrl} alt="" className="h-12 w-16 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{photo.location}</div>
                <div className="truncate font-mono text-xs text-ash">
                  {[
                    photo.camera,
                    summarizeSettings(toSettings(photo.settings)),
                    photo.tags.map((entry) => entry.tag.name).join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Link href={`/admin/photos/${photo.id}`} className="text-sm text-gold">
                Edit
              </Link>
            </li>
          ))}
        </ul>
        {photos.length === 0 ? <p className="text-sm text-ash">No photos yet.</p> : null}
      </section>
    </div>
  );
}
