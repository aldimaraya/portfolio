import { redirect } from 'next/navigation';
import { OPEN_PHOTO_PARAM, RETURN_PARAM } from '@/lib/photo/lightbox-link';

/**
 * Photos are edited in the Stills library's inspector now. Kept so old links
 * and bookmarks to a photo's own page still land on it; the return path rides
 * along untouched, and the library checks it like any other crafted input.
 */
export default async function EditPhotoRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const back = (await searchParams)[RETURN_PARAM];
  const query = new URLSearchParams({ [OPEN_PHOTO_PARAM]: id });
  if (typeof back === 'string') query.set(RETURN_PARAM, back);
  redirect(`/admin/photos?${query.toString()}`);
}
