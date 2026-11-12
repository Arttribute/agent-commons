import { Suspense } from "react";
import { ConsolePage } from "@/components/educator/console-page";
import { EducatorEvent } from "@/components/educator/event-registrations";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const { projectId, eventId } = await params;
  return (
    <ConsolePage>
      <Suspense>
        <EducatorEvent projectId={projectId} eventId={eventId} />
      </Suspense>
    </ConsolePage>
  );
}
