import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical, Radio } from "lucide-react";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import LiveSession from "@/models/LiveSession";
import { LiveLearnerRoom } from "@/components/live/live-learner-room";

export default async function LiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connectDB();
  const liveSession = (await LiveSession.findById(id)
    .select("title status")
    .lean()) as unknown as { title: string; status: "draft" | "lobby" | "live" | "ended" } | null;
  if (!liveSession || liveSession.status === "draft") notFound();
  const currentUser = await auth();
  if (!currentUser?.user?.id) {
    const callbackUrl = `/live/${id}`;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12 text-white">
        <section className="w-full max-w-md rounded-3xl bg-white p-7 text-slate-950 shadow-2xl sm:p-9">
          <div className="flex items-center gap-2.5 text-sm font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white"><FlaskConical className="h-4 w-4" /></span>CommonLab</div>
          <span className="mt-10 flex h-11 w-11 items-center justify-center rounded-xl bg-[#71E0E7]/25"><Radio className="h-5 w-5" /></span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">You’re joining live</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{liveSession.title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Use your CommonLab account so your workbook responses, progress, and copilot support stay with you. After signing in, you’ll return directly to this room.</p>
          <div className="mt-7 grid gap-2">
            <Link href={`/auth/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="rounded-xl bg-slate-950 px-5 py-3 text-center text-sm font-bold text-white">Create an account</Link>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">I already have an account</Link>
          </div>
        </section>
      </main>
    );
  }
  return <LiveLearnerRoom sessionId={id} />;
}
