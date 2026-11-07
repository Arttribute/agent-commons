import { ConsolePage } from "@/components/educator/console-page";
import { EducatorProjectPages } from "@/components/educator/project-pages";
import { commonsWebUrl } from "@/lib/project-pages";
export default function Pages() {
  return (
    <ConsolePage>
      <EducatorProjectPages commonsUrl={commonsWebUrl()} />
    </ConsolePage>
  );
}
