/**
 * The round trip from the lightbox to a photo's admin form and back.
 *
 * The lightbox is component state, not a route, so nothing about it survives a
 * navigation away from /stills. What survives is the URL: the edit link carries
 * the wall's own query string — filters, sort, seed — plus the photo that was
 * open, and the wall reopens that photo when it arrives back.
 */

/** The query parameter the wall reads to open a photo on arrival. */
export const OPEN_PHOTO_PARAM = 'photo';

/** The query parameter the edit page reads for where to go after a save. */
export const RETURN_PARAM = 'return';

/**
 * The admin form for one photo, told to come back to this exact wall with the
 * photo open. `search` is the wall's current query string, with or without `?`.
 */
export function editPhotoHref(id: string, search: string): string {
  const params = new URLSearchParams(search);
  params.set(OPEN_PHOTO_PARAM, id);
  const back = `/stills?${params.toString()}`;
  return `/admin/photos/${encodeURIComponent(id)}?${RETURN_PARAM}=${encodeURIComponent(back)}`;
}

/**
 * The query string with the open-photo request removed, `?` included when
 * anything is left. The wall drops the parameter once it has acted on it, so
 * closing the lightbox and then reloading does not open it all over again.
 */
export function withoutOpenPhoto(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(OPEN_PHOTO_PARAM);
  const query = params.toString();
  return query ? `?${query}` : '';
}
