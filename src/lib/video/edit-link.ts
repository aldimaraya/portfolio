/**
 * The round trip from a clip's page to its admin form and back — the motion
 * counterpart to lib/photo/lightbox-link. Simpler, because a clip is already a
 * route: the page to come back to is just /motion/[id], with nothing to reopen.
 */
import { RETURN_PARAM } from "@/lib/photo/lightbox-link";

/** The admin form for one clip, told to come back to the clip's own page. */
export function editVideoHref(id: string): string {
  const back = `/motion/${encodeURIComponent(id)}`;
  return `/admin/videos/${encodeURIComponent(id)}?${RETURN_PARAM}=${encodeURIComponent(back)}`;
}
