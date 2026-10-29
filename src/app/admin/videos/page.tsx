import { db } from "@/lib/db";
import { listTagNames } from "@/lib/tags";
import { VideoForm } from "@/components/admin/VideoForm";
import { VideoList } from "@/components/admin/VideoList";
import { LABEL } from "@/components/admin/fields";

export const dynamic = "force-dynamic";

export default async function AdminVideosPage() {
  const [rolls, videos, tagOptions] = await Promise.all([
    db.roll.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.video.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { tags: { include: { tag: true } } },
    }),
    listTagNames(),
  ]);

  const toRow = (video: (typeof videos)[number]) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    posterImageUrl: video.posterImageUrl,
    spriteFrames: video.spriteFrames,
    tags: video.tags.map((entry) => entry.tag.name),
  });

  // Rows older than rolls, until scripts/backfill-rolls.mjs files them or they
  // are dragged onto one. Listed on their own rather than under the first roll,
  // where /motion shows them: here the point is to notice them.
  const unfiled = videos.filter((video) => !video.rollId);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className={`mb-4 ${LABEL}`}>Add a video</h2>
        <VideoForm
          tagOptions={tagOptions}
          rolls={rolls.map((roll) => ({ id: roll.id, name: roll.name }))}
        />
      </section>

      <section>
        <h2 className={`mb-4 ${LABEL}`}>All videos ({videos.length})</h2>
        {/* One board across every roll: a drag reorders a roll or carries a clip
            onto another one, and each roll is renamed, reordered or deleted on
            its own heading. sortOrder only means anything within a roll, so each
            list is saved on its own. */}
        <VideoList
          groups={[
            ...rolls.map((roll) => ({
              rollId: roll.id,
              name: roll.name,
              description: roll.description,
              videos: videos
                .filter((video) => video.rollId === roll.id)
                .map(toRow),
            })),
            ...(unfiled.length
              ? [
                  {
                    rollId: null,
                    name: "Not on a roll",
                    description: "",
                    videos: unfiled.map(toRow),
                  },
                ]
              : []),
          ]}
        />
      </section>
    </div>
  );
}
