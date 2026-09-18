import { CourseEditor } from "@/components/educator/course-editor";
import { ConsolePage } from "@/components/educator/console-page";
import { PageHeader } from "@/components/ui/surface";

export default function NewCoursePage() {
  return (
    <ConsolePage width="narrow">
      <PageHeader
        title="New course"
        back={{ href: "/educator/courses", label: "Courses" }}
        info="Start with the essentials. Content, pricing, schedule and branding are set up inside the course afterwards."
      />
      <CourseEditor />
    </ConsolePage>
  );
}
