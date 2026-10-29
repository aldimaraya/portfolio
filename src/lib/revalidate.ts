/**
 * The paths a whole public section is revalidated by, with `'layout'`.
 *
 * `revalidatePath(path, 'layout')` expires the cache tag `<path>/layout`, and Next
 * names a page's layout tags after its *route*, route group included — /motion
 * is tagged `/(site)/motion/layout`, never `/motion/layout`. Passing the URL
 * instead matches nothing and fails silently: that is how /motion went from July
 * to October updating only on deploys, while the admin, which reads the database
 * directly, showed every new clip. The prerendered `.meta` files under
 * `.next/server/app/` list each page's real tags.
 *
 * A plain `revalidatePath('/stills')` is unaffected — it matches the page's
 * pathname tag, which has no group in it — so only the 'layout' calls need these.
 */
export const MOTION_LAYOUT = '/(site)/motion';
export const JOURNAL_LAYOUT = '/(site)/journal';
