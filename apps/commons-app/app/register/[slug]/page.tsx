import { redirect } from "next/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string | string[] }>;
}) {
  const { slug } = await params;
  const raw = (await searchParams).reference;
  const reference = Array.isArray(raw) ? raw[0] : raw;
  const target = new URL(
    "/register/" + encodeURIComponent(slug),
    "https://commonlab.agentcommons.io",
  );
  if (reference) target.searchParams.set("reference", reference);
  redirect(target.href);
}
