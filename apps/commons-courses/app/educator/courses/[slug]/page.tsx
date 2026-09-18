import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  ClipboardCheck,
  Eye,
  FileText,
  Radio,
  Rocket,
  Share2,
} from "lucide-react";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { courseHref } from "@/lib/educator-nav";
import Enrollment from "@/models/Enrollment";
import LiveSession from "@/models/LiveSession";
import Payment from "@/models/Payment";
import Submission from "@/models/Submission";
import { ButtonLink } from "@/components/ui/button";
import { Badge, List, ListRow, PageHeader, StatStrip } from "@/components/ui/surface";

type NextStep = { href: string; title: string; meta: string; icon: typeof BookOpen };

export default async function CourseOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");
  const course = result.course;

  const [students, payments, toReview, activeSession] = await Promise.all([
    Enrollment.countDocuments({ courseId: course._id }),
    Payment.find({ courseId: course._id, status: "completed" }).select("amount").lean(),
    Submission.countDocuments({ courseId: course._id, status: "submitted" }),
    LiveSession.findOne({ courseId: course._id, status: { $in: ["live", "lobby"] } })
      .select("title status")
      .lean<{ _id: unknown; title: string; status: string } | null>(),
  ]);
  const gross = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const modules = course.modules?.length || 0;
  const lessons = course.modules?.reduce((sum, module) => sum + (module.lessons?.length || 0), 0) || 0;

  const steps: NextStep[] = [];
  if (activeSession) {
    steps.push({
      href: courseHref(slug, `live/${String(activeSession._id)}?tab=run`),
      title: `Return to ${activeSession.title}`,
      meta: activeSession.status === "live" ? "Live now" : "Lobby open",
      icon: Radio,
    });
  }
  if (toReview) {
    steps.push({
      href: courseHref(slug, "assignments"),
      title: `Review ${toReview} submission${toReview === 1 ? "" : "s"}`,
      meta: "Coursework",
      icon: ClipboardCheck,
    });
  }
  if (!lessons) {
    steps.push({ href: courseHref(slug, "content"), title: "Add your first lesson", meta: "Content", icon: BookOpen });
  }
  if (!course.description || !course.imageUrl) {
    steps.push({
      href: courseHref(slug, course.imageUrl ? "edit?tab=description" : "edit?tab=media"),
      title: course.imageUrl ? "Write a course description" : "Add a course image",
      meta: "Details",
      icon: FileText,
    });
  }
  if (!course.published) {
    steps.push({
      href: courseHref(slug, "edit?tab=publishing"),
      title: "Publish the course",
      meta: "Learners can enroll once it is published",
      icon: Rocket,
    });
  } else {
    steps.push({ href: `/courses/${slug}`, title: "Share the course page", meta: "Public page", icon: Share2 });
  }

  return (
    <div>
      <PageHeader
        title={course.title}
        meta={
          <span className="flex items-center gap-2">
            <Badge tone={course.published ? "success" : "neutral"} dot>
              {course.published ? "Published" : "Draft"}
            </Badge>
            <span className="capitalize">
              {course.courseType === "live" ? "Live" : "Self-paced"} · {course.level}
            </span>
          </span>
        }
        actions={
          <ButtonLink href={`/courses/${slug}`} icon={Eye}>
            View page
          </ButtonLink>
        }
      />

      <StatStrip
        className="mb-8"
        items={[
          { label: "Learners", value: students },
          { label: "Revenue", value: formatMoney(gross, course.currency) },
          { label: "Content", value: `${modules} modules · ${lessons} lessons` },
          { label: "To review", value: toReview },
        ]}
      />

      <p className="mb-2 text-sm font-medium">Up next</p>
      <List>
        {steps.slice(0, 4).map((step) => (
          <ListRow
            key={step.title}
            href={step.href}
            leading={
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <step.icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
            }
            title={step.title}
            meta={step.meta}
            trailing={<ArrowUpRight className="h-4 w-4 text-stone-300" strokeWidth={1.75} />}
            chevron={false}
          />
        ))}
      </List>
    </div>
  );
}

function formatMoney(amount: number, currency?: string) {
  const code = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat(code === "KES" ? "en-KE" : "en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(amount);
}
