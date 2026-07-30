import Link from 'next/link';
import { db } from '@/lib/db';

// Counts must reflect the database on every visit, never a build-time snapshot.
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [photos, videos, posts, drafts] = await Promise.all([
    db.photo.count(),
    db.video.count(),
    db.blogPost.count(),
    db.blogPost.count({ where: { draft: true } }),
  ]);

  const cards = [
    {
      href: '/admin/photos',
      label: 'Photos',
      value: photos,
      note: 'Ordered automatically by colour',
    },
    {
      href: '/admin/videos',
      label: 'Videos',
      value: videos,
      note: 'Ordered manually within each roll',
    },
    {
      href: '/admin/posts',
      label: 'Posts',
      value: posts,
      note: `${drafts} in draft`,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="rounded border border-hairline bg-frame p-5 transition hover:border-gold"
        >
          <div className="font-mono text-xs tracking-[0.15em] text-ash uppercase">
            {card.label}
          </div>
          <div className="mt-2 text-3xl">{card.value}</div>
          <div className="mt-1 text-xs text-ash">{card.note}</div>
        </Link>
      ))}
    </div>
  );
}
