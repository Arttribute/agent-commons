# Project pages

A project can own fully custom coded pages without adopting the Commons app's visual theme. CommonLab and business pages use the same API, source files, S3 publisher and versioned deployments.

## Contract

- Every page belongs to an owned Commons project. `surface` selects `commonlab`, `business` or `commons`; it is not an extra authority grant.
- Source lives in an existing agent-owned code project. The project page records that link and a globally unique public slug.
- Draft metadata and source changes do not replace the live page. Publishing builds the source with the existing code-project builder and pins the ready immutable deployment plus an explicit public metadata snapshot.
- Public readers receive only the published snapshot and asset URL. They never receive project instructions, knowledge, files, owner credentials or private chat sessions.
- The arbitrary page runs in a sandboxed, credential-free iframe. Its optional page SDK can ask the host to open a reviewable Commons chat draft. Visitors use their own authenticated account and agent. It does not run the project owner's agent or silently spend credits.
- Unpublishing makes the page and its backing code project private, including immutable asset URLs. Soft-deleted parent projects are not public.
- CommonLab supplies an educator entry point and a public host for CommonLab pages. Business projects can use the same context and APIs without a second publishing stack. Custom domains and arbitrary server-side applications are later additions, not implied by static browser-app publishing.

## First example

AI Kids Hacker Camp uses the approved original illustration, official NODE logo, cream / navy / cobalt palette and Space Grotesk / Inter fonts. Confirmed facts: 9–11 December 2026, 09:30–12:30 EAT, ages 7–13, KSh 5,000 for all three mornings, NODE NBO Gigiri. Activity names are comics & filmmaking and games & simple apps / interactive stories. The removed poster slogans and footer placeholders are not added back.

Google Forms remains the registration destination. No fake form URL, availability, payment instructions or facilitator roster is published. The starter's configuration can accept the real interest-form URL once the organiser creates and opens it. Forms and the booking desk remain separate from public page source.

## Verification

Test owner boundaries, cross-project links, draft / live separation, immutable deployment pinning, unpublishing, slug validation and read-only public gateway routing. Test the page bridge against wrong source / nonce messages and automatic chat execution. Build the actual camp source with its branded assets and inspect desktop / mobile layouts. All repo changes follow staging → CI → staging verification → release.

## Bring your own tool

The common handoff is a ZIP of a built browser site (`index.html`, JavaScript, CSS, images and fonts). Users can code in Commons or export from their preferred tool. Importing a build does not execute its code on the server. Imported files have bounded compressed / expanded sizes, an extension allowlist and path / symlink checks. Existing React code projects remain editable inside Commons. Arbitrary backend processes / SSR servers require a later isolated application-runtime feature; they are not run by the static publisher.

A preview is an explicit **unlisted public link**, consistent with the existing code-project publisher. It does not update the friendly live page. This differs from private source editing; the owner UI names that visibility before creating the link. Publishing pins an immutable deployment and metadata snapshot. Unpublishing revokes the backing project's public assets as well as the friendly page.

## Integrating an external build

1. Build a browser-only site in any tool. Export static output rather than a server process. Bundle JavaScript, CSS, images and fonts locally. The sandbox blocks external script, network and embedded-frame connections in this first version.
2. Create an owned Commons project and page, or use CommonLab → Project pages. Pick the agent used for source editing. CommonLab is a context for the same owned project, not a separate copy of the site.
3. In the page editor choose Import build. The browser accepts ZIPs up to 3 MB because of the hosting request-body limit. The authenticated API accepts ZIPs up to 8 MB: `POST /v1/projects/:projectId/pages/:pageId/import` with multipart field `file`. Expanded builds are limited to 8 MB total, 3 MB per file and 400 files.
4. Save explicit public metadata and optional public chat information. Build an unlisted preview, review it, then publish. The previous live deployment stays pinned until a successful publish.
5. To add chat to an imported frontend, import `{openChat, pageContext}` from the credential-free ES module at `/v1/project-page-sdk.js` on the API origin. Call `openChat()` from an intentional visitor action. The host opens a review step and then a draft in the visitor’s own account. No private project context is supplied and no message is sent automatically.

Management endpoints require the owner’s user credential. `GET /v1/project-pages/:slug` is the only public metadata read; `/v1/project-pages` remains private. The public response includes an immutable `entryUrl`. Do not hand-roll an authenticated API proxy inside public page code or embed an owner token in a build.

Set `PROJECT_PAGE_HOST_ORIGINS` on the API to the exact deployed Commons / CommonLab origins if they differ from the defaults. Set `NEXT_PUBLIC_AGENT_COMMONS_APP_URL` on CommonLab when the Commons editor is on a different environment. CommonLab uses the educator’s own identity access token for management and never falls back to a platform service key.

Publication uses a revision check so an older in-flight build cannot undo an unpublish or overwrite a newer saved draft. Page assets also check the page’s revocation flag and its parent project. A linked page’s HTML and its moving latest-deployment alias use `no-store`. Scripts, styles, images and fonts under a pinned deployment URL never change, so they use `private, max-age=31536000, immutable`: the visitor’s own browser may reuse them, while CloudFront and other shared caches never store them, so unpublishing still revokes them for everyone who has not already downloaded them. Assets previously downloaded by a visitor cannot be recalled.

## Loading speed

The Commons and CommonLab hosts render the sandboxed frame in their server HTML, with a fresh per-request nonce and the request’s origin, so the page starts loading with the host document rather than after hydration. The frame corrects the origin from `window.location` after hydration if a proxy reported a different one. Never serve these host routes from a shared cache, because the nonce must stay unique per response.

A React page can mark the image visible on load with an import suffix, `import hero from '../assets/hero.webp?preload'`. The builder then adds `<link rel="preload" as="image" fetchpriority="high">` to the generated HTML, so the image downloads alongside the script instead of after the first render. The suffix applies only to local PNG, JPEG, GIF and WebP imports; inline previews leave it out because they embed every image.

The new gateway public routes can only be verified through the production gateway after promotion because the gateway has no staging deployment. Check signed-out GET metadata / SDK, anonymous private-list rejection, live assets and unpublication immediately after deployment.
