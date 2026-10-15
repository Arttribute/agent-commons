# Referrals, appearance and chat continuation

The inviter earns 1,000 credits after a unique, verified first Agent Commons
activation. The invitee keeps the existing welcome-credit flow. Invitations do
not themselves grant credits.

The app captures first-touch attribution in a 30-day HTTP-only, same-site
cookie at `/r/<code>`. Codes contain 128 bits of randomness. Its server-side
OAuth callback attests the activation using the dedicated Agent Commons service
identity; a browser, management key or unrelated service cannot grant referral
rewards. A failed delivery to the API remains in the signed session for retry.
Existing credit accounts created before activation cannot be attributed.

The signup row and ledger grant commit in one PostgreSQL transaction. Permanent
unique constraints on the referred principal and canonical email hash prevent
repeat rewards, including Gmail dot/plus aliases and account recreation. The
inviter cannot refer themselves or their email aliases. The ledger also has an
idempotency key for each referred principal.

Email invitations reserve a durable invitation ID before using Resend, use that
ID as the provider idempotency key, and confirm the result afterward. Retries
after an ambiguous timeout retain the same reservation. Old unconfirmed sends
are not resent beyond the provider's idempotency window. Invitations are limited
to ten distinct recipients per inviter per rolling day and five requests per
minute. Completed invitations to the same recipient are not sent again.

Apply versioned migration `044_referral_program.sql` through the usual API
deployment. The web environment needs `RESEND_API_KEY`, with optional
`REFERRAL_EMAIL_FROM` (default `Agent Commons <hello@agentcommons.io>`). The
staging Vercel environment has been configured. The API trusts
`svc_agent_commons_staging` when `APP_ENV=staging`, otherwise
`svc_agent_commons`; `REFERRAL_APP_SERVICE_PRINCIPAL` can explicitly override
this for another deployment. The GitHub environment variable of that name is
passed through CodeBuild and CloudFormation into the API. Set it to the app's
actual authenticated principal (`/v1/auth/me`), which can be the OAuth client ID
on identity versions that omit a service-account `sub` claim. Staging configures
that exact dedicated client ID; unrelated service credentials remain rejected.
Check this setting before production promotion too. New API endpoints are authenticated and require
no public gateway allowlist entries.

Appearance is Light by default, with explicit Dark and System settings. A
script applies the theme before paint. Browser preferences and desktop's native
timestamped preferences persist it, including desktop restarts and Cloud/Local
mode switches. The desktop's native theme and window background follow the
same preference. Sidebar, page, card, muted and overlay surfaces remain
distinct. Legacy neutral utilities and the shared UI kit's surface variables
adapt to the theme. Compact account and agent icons use a shared 28px size.

Agent Commons session lists and suggestions include web sessions with existing
agents. CLI, Common OS and orphaned Arcade/system sessions remain available to
API clients and by explicit ID, while they stay out of web/desktop recents.
Summaries include project IDs so project chats are grouped correctly. Account
and mode changes do not show the previous session list while loading.

Personal suggestions must name an exact source session from the supplied
history. They include concrete recent context and a detailed execution prompt.
`readUserChat` and `listUserChats` expose owner-scoped history across general
and project chats. Long messages have character-offset pagination rather than
silent truncation. Retrieval tools are retained when the model tool budget is
full. Historical content is data, not new instructions. Each tool trace has an
independent native disclosure for its full arguments and result/error.

Desktop changes are tested by the Desktop workflow. Existing desktop installers
receive them through the repository's separate desktop release procedure.

## Logo artifacts

The built-in imagegen tool produced `apps/commons-app/public/logo-transparent.png`
and `apps/commons-app/public/logo-dark.png`. `CommonsLogo` selects the variant.
The dark variant uses white lettering throughout. Its gradient endpoints match
Tailwind yellow-700 (#a16207), pink-700 (#be185d), green-700 (#15803d) and
cyan-700 (#0e7490), targeting at least 4.5:1 contrast for small white lettering.
These retain the original hue families while darkening the bars.

Light edit prompt:

> Remove only the pure white background surrounding the text and gradient
> highlights, including all white gaps between and around letters. Make those
> regions truly alpha transparent. Preserve the exact existing text “Agent
> Commons”, lettering shape, position, proportions, black color, existing
> yellow-pink first-row and green-cyan second-row gradient rounded blocks.
> Do not redesign, redraw, recolor, add elements or shadows. Output tightly
> cropped to original artwork on transparent background.

Dark edit prompt:

> Use case: precise-object-edit. Asset: exact existing Agent Commons logo for a dark sidebar, transparent PNG. Reference image is the ORIGINAL brand logo. Preserve its exact geometry, slightly tilted letter shapes, typography, two rows, spacing and aspect ratio. Change every black letter in both 'Agent' and 'Commons' to solid pure white #ffffff, including the standalone t. Replace only the two rounded gradient bars with MUCH DARKER gradients suitable for small white text: top bar smoothly yellow-700 #a16207 to pink-700 #be185d, bottom bar green-700 #15803d to cyan-700 #0e7490, horizontal interpolation, absolutely no brighter highlights or pastel pixels. These endpoint colors provide about 5:1 or better contrast for white lettering. Keep the original gradient hue families and original bar silhouettes. Remove the surrounding white field to real alpha transparency. CRITICAL clean flat digital logo: hard smooth antialiased outlines, opaque white letters, no texture, glow, shadows, fuzz, streaks, random pixels or halo. Preserve the original exact spelling Agent Commons and original letter silhouettes. Output a faithful color edit, not a redesign.

Desktop invitations use the hosted app with a user bearer token verified at
identity’s userinfo endpoint for opaque OAuth tokens or checked against its
configured JWKS, issuer and platform audience for device-sign-in JWTs. Expiry,
user actor type and verified email are required. Native installations hold no Resend or app-service
credentials. Cookie-authenticated sends still require same-origin requests.
`COMMONS_DESKTOP_CLOUD_URL` optionally selects the hosted environment; public
invite links never use the native loopback URL. Verified first-activation
attestations originate only from the hosted OAuth callback.

Provider references: [Tailwind colors](https://tailwindcss.com/docs/colors), [Resend sending](https://resend.com/docs/api-reference/emails/send-email),
[Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys),
[Telegram sharing](https://core.telegram.org/widgets/share).
