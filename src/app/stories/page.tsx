import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import StoryViewer from "./StoryViewer";

// 보는 사람마다 다름 (좋아요·내 것)
export const instant = false;

export default async function StoriesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StoryViewer />
    </Suspense>
  );
}
