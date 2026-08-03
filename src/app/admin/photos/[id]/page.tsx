import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { listTagNames } from '@/lib/tags';
import { listPhotoLocations } from '@/lib/photo/facets';
import { PhotoForm } from '@/components/admin/PhotoForm';
import { BorderTrimmer } from '@/components/admin/BorderTrimmer';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { LABEL } from '@/components/admin/fields';
import { toSettings } from '@/lib/photo/settings';
import { deletePhoto } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
        initial={{
          id: photo.id,
          imageUrl: photo.imageUrl,
          width: photo.width,
          height: photo.height,
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
