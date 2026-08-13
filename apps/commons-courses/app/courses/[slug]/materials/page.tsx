import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Nav } from "@/components/nav";
import { CourseMaterialsLibrary } from "@/components/courses/course-materials-library";

export default async function CourseMaterialsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <div className="min-h-screen bg-slate-50"><Nav /><main className="mx-auto max-w-7xl px-4 pb-12 pt-24 sm:px-6"><Link href={`/courses/${slug}/learn`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back to course</Link><div className="mb-6 mt-6"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Your private course space</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Materials</h1><p className="mt-2 text-sm text-slate-500">Slides, workbooks, and reference documents shared by your educator.</p></div><CourseMaterialsLibrary slug={slug} /></main></div>;
}
