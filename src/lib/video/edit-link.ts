/**
 * The round trip from a clip's page to its admin inspector and back — the
 * motion counterpart to lib/photo/lightbox-link. Simpler, because a clip is
 * already a route: the page to come back to is just /motion/[id], with nothing
 * to reopen.
 */
import { RETURN_PARAM } from "@/lib/photo/lightbox-link";

/** The query parameter the admin Motion board selects a clip by. */
export const CLIP_PARAM = "clip";

/** The clip open in the Motion inspector, with nowhere in particular to go back to. */
export function adminClipHref(id: string): string {
  return `/admin/videos?${CLIP_PARAM}=${encodeURIComponent(id)}`;
}

/** The clip open in the Motion inspector, told to come back to the clip's own page. */
export function editVideoHref(id: string): string {
  const back = `/motion/${encodeURIComponent(id)}`;
  return `${adminClipHref(id)}&${RETURN_PARAM}=${encodeURIComponent(back)}`;
}
