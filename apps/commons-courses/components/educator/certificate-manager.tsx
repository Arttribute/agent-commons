"use client";

import { useRef, useState } from "react";
import { Award, Plus, RefreshCw, Send } from "lucide-react";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, EmptyState, List, ListRow } from "@/components/ui/surface";

export type CertificateRow = {
  id: string;
  recipientName: string;
  recipientEmail: string;
  completionPeriod: string;
  filename: string;
  awardedAt: string | null;
  emailStatus: string;
  emailSentAt: string | null;
  emailError: string | null;
  canSend: boolean;
};
type Learner = { id: string; name: string; email: string };

export function CertificateManager({ slug, courseTitle, initialCertificates, learners, emailConfigured }: {
  slug: string;
  courseTitle: string;
  initialCertificates: CertificateRow[];
  learners: Learner[];
  emailConfigured: boolean;
}) {
  const [certificates, setCertificates] = useState(initialCertificates);
  const [selected, setSelected] = useState(() => initialCertificates.filter((item) => item.canSend).map((item) => item.id));
  const [preview, setPreview] = useState<CertificateRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const endpoint = `/api/educator/courses/${encodeURIComponent(slug)}/certificates`;
  const available = certificates.filter((item) => item.canSend);
  const pendingIds = selected.filter((id) => available.some((item) => item.id === id));
  const unprepared = learners.filter((learner) => !certificates.some((item) => item.recipientEmail.toLowerCase() === learner.email.toLowerCase()));

  async function refresh() {
    const response = await fetch(endpoint);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load certificates.");
    setCertificates(data.certificates);
  }

  async function send() {
    if (inFlight.current || !pendingIds.length) return;
    inFlight.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${endpoint}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: pendingIds.slice(0, 30) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send certificates.");
      const sent = data.results.filter((result: { status: string }) => result.status === "sent").length;
      const failed = data.results.filter((result: { status: string }) => result.status === "failed").length;
      const skipped = data.results.length - sent - failed;
      setMessage(`${sent} certificate${sent === 1 ? "" : "s"} awarded and emailed.${failed ? ` ${failed} failed. Open the record for details and retry.` : ""}${skipped ? ` ${skipped} already sent or being processed. Refresh to check their status.` : ""}`);
      setSelected((ids) => ids.filter((id) => !data.results.some((result: { id: string; status: string }) => result.id === id && result.status === "sent")));
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not send certificates.");
      await refresh().catch(() => undefined);
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(endpoint, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare certificate.");
      await refresh();
      setSelected((ids) => [...ids, data.id]);
      setAdding(false); setRecipientName("");
      setMessage("Certificate prepared. Select Send to award it and email the participant.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not prepare certificate."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <div>
      <CourseSectionHeader section="learners" title="Certificates" meta={`${certificates.length} certificates · ${certificates.filter((item) => item.emailStatus === "sent").length} emailed`} info="Send awards course completion, makes the certificate available in the learner's dashboard, and emails the PDF. Sent means the email provider accepted the message." actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={RefreshCw} disabled={busy} onClick={() => refresh().catch((error) => setError(error.message))}>Refresh</Button>
          <Button size="sm" icon={Plus} disabled={busy || !unprepared.length} onClick={() => setAdding(true)}>Prepare certificate</Button>
          <Button variant="primary" size="sm" icon={Send} loading={busy && !adding} disabled={!emailConfigured || !pendingIds.length || busy} onClick={send}>Send {Math.min(pendingIds.length, 30)} certificates</Button>
        </div>
      } />
      {!emailConfigured ? <p className="mb-4 text-sm text-red-700" role="alert">Certificate email is not configured. Set the Resend API key and sender before sending.</p> : null}
      {error ? <p className="mb-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-foreground" role="status">{message}</p> : null}
      {certificates.length ? <>
        <label className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" disabled={busy || !available.length} checked={available.length > 0 && available.every((item) => selected.includes(item.id))} onChange={(event) => setSelected(event.target.checked ? available.map((item) => item.id) : [])} />
          Select all ready certificates
        </label>
        <List>{certificates.map((item) => <ListRow key={item.id}
          leading={<input type="checkbox" aria-label={`Send certificate to ${item.recipientName}`} checked={selected.includes(item.id) && item.canSend} disabled={busy || !item.canSend} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />}
          title={item.recipientName} meta={item.recipientEmail}
          trailing={<><Badge tone={item.emailStatus === "sent" ? "success" : item.emailStatus === "failed" ? "danger" : "warning"}>{item.emailStatus === "sent" ? "Email sent" : item.emailStatus === "failed" ? "Email failed" : item.emailStatus === "sending" ? "Sending" : "Ready to send"}</Badge><Button size="sm" variant="ghost" onClick={() => setPreview(item)}>Review</Button></>}
        />)}</List>
      </> : <EmptyState icon={Award} title="No certificates prepared" description="Upload each learner's PDF, then send to award completion and notify them." action={<Button icon={Plus} onClick={() => setAdding(true)}>Prepare certificate</Button>} />}
      <Drawer open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.recipientName || "Certificate"} description={preview?.recipientEmail} width="lg" footer={preview ? <ButtonLink external href={`/api/certificates/${preview.id}/pdf`}>Open PDF</ButtonLink> : undefined}>
        {preview ? <div className="space-y-5">
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Subject:</span> Your certificate of completion: {courseTitle}</p>
            <p>Congratulations, {preview.recipientName}</p>
            <p>You have been awarded your certificate of completion for {courseTitle}{preview.completionPeriod ? ` (${preview.completionPeriod})` : ""}. Thank you for taking part.</p>
            <p>Your certificate is attached to this email as a PDF. You can also find it in your CommonLab dashboard.</p>
            <p className="text-muted-foreground">Attachment: {preview.filename}</p>
            {preview.awardedAt ? <p>Completion awarded: {new Date(preview.awardedAt).toLocaleDateString()}</p> : <p className="text-muted-foreground">Completion will be awarded when you select Send.</p>}
            {preview.emailError ? <p className="text-red-700" role="alert">{preview.emailError}</p> : null}
            {!preview.canSend && preview.emailStatus !== "sent" ? <p className="text-red-700">{preview.emailStatus === "sending" ? "An email attempt is in progress. Refresh to check its status. If it remains stuck, check the email provider before sending again." : "The safe retry window has expired. Check the email provider delivery record before sending again."}</p> : null}
          </div>
          <iframe title={`Certificate for ${preview.recipientName}`} src={`/api/certificates/${preview.id}/pdf`} className="h-[380px] w-full rounded-lg border border-border" />
        </div> : null}
      </Drawer>
      <Drawer open={adding} onClose={() => { if (!busy) setAdding(false); }} title="Prepare certificate" description="Upload a completed certificate PDF for an enrolled learner." as="form" onSubmit={prepare} footer={<Button type="submit" variant="primary" loading={busy}>Save draft</Button>}>
        <div className="space-y-4">
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <Field label="Learner"><Select name="userId" aria-label="Learner" required defaultValue="" onChange={(event) => setRecipientName(unprepared.find((learner) => learner.id === event.target.value)?.name || "")}><option value="" disabled>Choose learner</option>{unprepared.map((learner) => <option key={learner.id} value={learner.id}>{learner.name} · {learner.email}</option>)}</Select></Field>
          <Field label="Name on certificate"><Input name="recipientName" aria-label="Name on certificate" required maxLength={160} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></Field>
          <Field label="Completion period" optional><Input name="completionPeriod" aria-label="Completion period" maxLength={120} placeholder="August 2026" /></Field>
          <Field label="Certificate PDF" hint="Maximum 2 MB"><Input name="file" aria-label="Certificate PDF" type="file" accept="application/pdf,.pdf" required /></Field>
        </div>
      </Drawer>
    </div>
  );
}
