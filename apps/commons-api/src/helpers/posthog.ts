import { PostHog } from 'posthog-node';

let posthog: PostHog | null = null;

export function getPosthog() {
  if (posthog) return posthog;
  posthog = new PostHog(process.env.POSTHOG_PUBLIC_API_KEY!, {
    host: 'https://events.posthog.analytics.eventpass.ke',
  });
  return posthog;
}
