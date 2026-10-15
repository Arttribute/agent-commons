export const REFERRAL_COOKIE = 'agc-referral';
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function referralMessage(url: string) {
  return `Join me on Agent Commons to chat with agents and bring your ideas to life. ${url}`;
}

export function referralShares(url: string) {
  const message = referralMessage(url);
  return [
    { name: 'WhatsApp', icon: 'whatsapp', href: `https://wa.me/?text=${encodeURIComponent(message)}` },
    { name: 'X', icon: 'x', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}` },
    { name: 'Telegram', icon: 'telegram', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(referralMessage('').trim())}` },
    { name: 'Facebook', icon: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { name: 'LinkedIn', icon: 'linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { name: 'Reddit', icon: 'reddit', href: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent('Join me on Agent Commons')}` },
  ];
}

export type ReferralSummary = {
  code: string;
  url: string;
  rewardCredits: number;
  joined: number;
  earned: number;
  signups: Array<{ joinedAt: string; credits: number }>;
  invitations: Array<{ email: string; status: string; createdAt: string }>;
};
