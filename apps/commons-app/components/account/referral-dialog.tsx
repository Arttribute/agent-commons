"use client";

import { useCallback, useEffect, useState } from 'react';
import { Copy, Gift, Loader2, Send, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BrandLogo } from '@/components/landing/brand-logo';
import { referralMessage, referralShares, type ReferralSummary } from '@/lib/referrals';

export function ReferralDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(false);
  const [nativeShare, setNativeShare] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/referrals', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || 'Could not load your invitations.');
      setSummary(result.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your invitations.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) { void load(); setNativeShare(typeof navigator.share === 'function'); } }, [open, load]);

  const copy = async () => {
    if (!summary) return;
    try { await navigator.clipboard.writeText(summary.url); setNotice('Invitation link copied.'); }
    catch { setError('Could not copy. Select and copy your invitation link below.'); }
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/referrals/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.message || 'Could not send invitation.');
      setNotice(result.message); setEmail(''); void load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send invitation.'); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-xl p-6 sm:p-8">
      <DialogHeader className="items-center text-center sm:text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted"><Gift className="h-7 w-7" strokeWidth={1.75} /></span>
        <DialogTitle className="text-xl font-medium">Invite to get credits</DialogTitle>
        <DialogDescription>Get 1,000 credits when a new friend joins Agent Commons through your invitation.</DialogDescription>
      </DialogHeader>
      {loading && !summary && <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your invitation…</p>}
      {summary && <>
        <Tabs defaultValue="web" className="mt-2">
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="web">Share on web</TabsTrigger><TabsTrigger value="mobile">Share on mobile</TabsTrigger></TabsList>
          <TabsContent value="web" className="space-y-4 pt-3">
            <Button className="w-full gap-2" onClick={() => void copy()}><Copy className="h-4 w-4" />Copy invitation link</Button>
            <Input aria-label="Your invitation link" readOnly value={summary.url} onFocus={(event) => event.target.select()} className="text-xs" />
            <div className="grid grid-cols-3 gap-2">
              {referralShares(summary.url).map((share) => <Button key={share.name} variant="outline" asChild className="gap-2 px-2 text-xs">
                <a href={share.href} target="_blank" rel="noopener noreferrer" aria-label={`Invite on ${share.name}`} onClick={() => {
                  if (share.name === 'Facebook' || share.name === 'LinkedIn') setNotice('Add your own message in the share composer.');
                }}><BrandLogo name={share.icon} size={16} />{share.name}</a>
              </Button>)}
            </div>
            {nativeShare && <Button variant="outline" className="w-full gap-2" onClick={() => void navigator.share({ title: 'Agent Commons', text: referralMessage('').trim(), url: summary.url }).catch((cause) => {
              if (cause.name !== 'AbortError') setError('Could not open sharing. Copy your invitation link instead.');
            })}><Share2 className="h-4 w-4" />Share with another app</Button>}
            <form className="space-y-2 pt-1" onSubmit={(event) => void send(event)}>
              <label htmlFor="referral-email" className="text-sm font-medium">Send invitation email</label>
              <div className="flex gap-2"><Input id="referral-email" type="email" autoComplete="email" placeholder="Friend’s email address" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} disabled={busy} />
                <Button type="submit" variant="outline" disabled={busy || !email.trim()} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</Button></div>
            </form>
          </TabsContent>
          <TabsContent value="mobile" className="pt-4 text-center">
            {/* QR is generated locally on the server; referral links never go to a third-party QR service. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/referrals/qr" width={232} height={232} alt="Scan to open your Agent Commons invitation link" className="mx-auto rounded-xl border border-border" />
            <p className="mt-3 text-sm text-muted-foreground">Scan with your camera to invite from your phone.</p>
          </TabsContent>
        </Tabs>
        <p className="text-center text-xs text-muted-foreground">Only new, verified accounts qualify. Each friend counts once.</p>
        <button type="button" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => setHistory(!history)} aria-expanded={history}>Invitation history</button>
        {history && <div className="space-y-3 border-t border-border pt-4 text-sm">
          <p>{summary.joined} friends joined · {summary.earned.toLocaleString()} credits earned</p>
          {!summary.invitations.length && !summary.signups.length && <p className="text-muted-foreground">Your invitations and earned credits will appear here.</p>}
          {summary.invitations.map((invite) => <div key={invite.email} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{invite.email}</span><span className="shrink-0 text-xs text-muted-foreground">{invite.status === 'sent' ? 'Invited' : invite.status === 'failed' ? 'Delivery failed' : 'Sending'}</span></div>)}
          {summary.signups.map((signup, index) => <div key={index} className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Friend joined {new Date(signup.joinedAt).toLocaleDateString()}</span><span>+{signup.credits.toLocaleString()} credits</span></div>)}
        </div>}
      </>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{!summary && <Button variant="outline" disabled={loading} onClick={() => void load()}>Retry</Button>}</div>}
      {notice && <p role="status" className="text-center text-sm text-muted-foreground">{notice}</p>}
    </DialogContent>
  </Dialog>;
}
