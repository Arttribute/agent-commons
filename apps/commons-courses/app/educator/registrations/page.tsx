import { Suspense } from "react";
import { ConsolePage } from "@/components/educator/console-page";
import { EducatorRegistrations } from "@/components/educator/event-registrations";
export default function Page() {
  return (
    <ConsolePage>
      <Suspense>
        <EducatorRegistrations />
      </Suspense>
    </ConsolePage>
  );
}
