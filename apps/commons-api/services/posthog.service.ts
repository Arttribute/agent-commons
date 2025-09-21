import { PostHog } from "posthog-node";
import { container, inject } from "tsyringe";

const postHogClient = new PostHog(process.env.POSTHOG_PUBLIC_API_KEY!, {
  host: "https://eu.i.posthog.com",
});

container.register(PostHog, {
  useValue: postHogClient,
})

export function injectPostHogClient() {
    return inject(PostHog);
}
export function getPostHogClient() {
    return container.resolve<typeof postHogClient>(PostHog);
}
