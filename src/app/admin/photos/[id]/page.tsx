import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { listTagNames } from '@/lib/tags';
import { listPhotoLocations } from '@/lib/photo/facets';
import { PhotoForm } from '@/components/admin/PhotoForm';
import { BorderTrimmer } from '@/components/admin/BorderTrimmer';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { LABEL } from '@/components/admin/fields';
import { toSettings } from '@/lib/photo/settings';
import { takenAtToInputValue } from '@/lib/photo/date';
import { safeNextPath } from '@/lib/auth/next-path';
import { RETURN_PARAM } from '@/lib/photo/lightbox-link';
import { deletePhoto } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditPhotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // Set when the edit was opened from the lightbox, so a save lands back on the
  // wall with the photo open. Anyone can craft this link, so it is reduced to a
  // path on this site before the form is allowed to navigate to it.
  const returnTo = safeNextPath((await searchParams)[RETURN_PARAM], '/admin/photos');
  const [photo, tagOptions, locationOptions] = await Promise.all([
    db.photo.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } } },
    }),
    listTagNames(),
    listPhotoLocations(),
  ]);
  if (!photo) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h2 className={LABEL}>Edit photo</h2>
      <PhotoForm
        tagOptions={tagOptions}
        locationOptions={locationOptions}
        returnTo={returnTo}
        initial={{
          id: photo.id,
          imageUrl: photo.imageUrl,
          width: photo.width,
          height: photo.height,
          title: photo.title,
          location: photo.location,
          camera: photo.camera,
          // The Json column is untyped at the DB boundary — coerce it before it
          // reaches the form.
          settings: toSettings(photo.settings),
          avgHue: photo.avgHue,
          avgChroma: photo.avgChroma,
          avgLightness: photo.avgLightness,
          warmth: photo.warmth,
          isMonochrome: photo.isMonochrome,
          takenAt: photo.takenAt ? takenAtToInputValue(photo.takenAt) : '',
          tags: photo.tags.map((entry) => entry.tag.name).join(', '),
        }}
      />
      <BorderTrimmer id={photo.id} imageUrl={photo.imageUrl} />
      <DeleteButton
        id={photo.id}
        action={deletePhoto}
        redirectTo="/admin/photos"
        label="Delete photo"
      />
    </div>
  );
}
