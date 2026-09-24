import { describe, expect, it } from "vitest";
import { editVideoHref } from "@/lib/video/edit-link";
import { safeNextPath } from "@/lib/auth/next-path";

describe("editVideoHref", () => {
  it("points at the clip form with the clip page as the way back", () => {
    const href = editVideoHref("clip123");
    const url = new URL(href, "https://example.invalid");
    expect(url.pathname).toBe("/admin/videos/clip123");
    expect(url.searchParams.get("return")).toBe("/motion/clip123");
  });

  // The edit page runs the return path through safeNextPath before the form may
  // navigate to it; a link this function builds must survive that unchanged.
  it("builds a return path the edit page accepts as it is", () => {
    const back = new URL(
      editVideoHref("clip123"),
      "https://example.invalid",
    ).searchParams.get("return");
    expect(safeNextPath(back ?? undefined, "/admin/videos")).toBe(
      "/motion/clip123",
    );
  });
});
