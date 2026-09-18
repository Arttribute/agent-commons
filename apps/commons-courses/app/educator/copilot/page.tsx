import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter, requireEducator } from "@/lib/educator-auth";
import Course from "@/models/Course";
import { ConsolePage } from "@/components/educator/console-page";
import { CopilotMaterialBuilder } from "@/components/educator/copilot-material-builder";
import { PageHeader } from "@/components/ui/surface";

export default async function EducatorCopilotPage() {
  const authResult = await requireEducator();
  if (authResult.error || !authResult.session) {
    redirect("/auth/signin?callbackUrl=/educator/copilot");
  }

  await connectDB();
  const courses = await Course.find(
    authResult.session.role === "admin"
      ? {}
      : buildManagedCoursesFilter({
          userId: authResult.session.userId,
          email: authResult.session.email,
          role: authResult.session.role,
        }),
  )
    .select("title slug")
    .sort({ updatedAt: -1 })
    .lean<Array<{ title: string; slug: string }>>();

  return (
    <ConsolePage width="narrow">
      <PageHeader
        title="Create with AI"
        info="Your copilot reads the files, keeps their structure and visuals, adds practice and checks, and saves a private draft for you to review. Nothing is published automatically."
      />
      <CopilotMaterialBuilder courses={courses} />
    </ConsolePage>
  );
}
