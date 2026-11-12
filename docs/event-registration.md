# Project event registration

Each Commons project can host branded registration pages at `/register/<slug>`.
CommonLab educators manage them under **Educator > Registrations**. The project
owner's Commons identity controls access, including when CommonLab was originally
created through Google sign-in. Participant and payment records are never public.

## Configure a programme

Create a draft in the educator console, choose the project, then set the price,
capacity, dates and venue. Brand and form configuration supports images, colours,
participant questions, agreement text, programme details and support contacts.
Connect the receiving Paystack account before opening a paid programme. Credentials
are encrypted with the API's existing `TOOL_KEY_ENCRYPTION_MASTER` and never returned.

The Commons project editor also offers the same registrations feature. Custom
sites built with any coding tool can link to the first-party registration URL or
use the public JSON API. A sandboxed project page can import `openRegistration`
from `@agent-commons/page`; the host opens only its owner's linked, validated
registration path. `openChat` opens the guest guide in the page.

## API

Authenticated project owners use `/v1/projects/<projectId>/events` (GET, POST),
`/<eventId>` (PATCH), `/<eventId>/registrations?offset=0` (GET), and `/paystack`
(GET, POST). Responses use `{ data }`. `event-policy.ts` is the configuration schema.

Public endpoints, with no account or credential required:

- `GET /v1/public-events/<slug>`: current price, capacity and published form.
- `POST /v1/public-events/<slug>/checkout`: `{ idempotencyKey, name, email, phone,
  participants: [{...configuredFieldAnswers}], agreed: true }`.
- `GET /v1/public-events/<slug>/payments/<reference>`: opaque, non-personal receipt.
- `POST /v1/public-events/<slug>/payments/<reference>/verify`: verify with Paystack.

The server determines totals and reserves capacity for 20 minutes, serialized per
event. Reuse the idempotency key when retrying identical input. Prices use minor
units: KES 8,000 is `800000`. Confirmation requires a server-verified successful
payment with the matching account mode, reference, metadata, currency and amount.
Late payments without space and mismatched amounts enter `review`, with `paid`
status. These need organiser follow-up; they never confirm an extra place.
Registration receipts can be saved or printed. This feature does not send email.

## Webhooks and deployment

Set the webhook URL returned when connecting Paystack. Existing CommonLab payment
accounts can keep `/api/payments/webhook`, which relays event messages and leaves
course payments with their existing handler. Raw body and legacy or timestamped
Paystack signatures are preserved. Callback verification also confirms payments
when a webhook is delayed. A webhook outage remains retryable.

Migration `047_event_registrations.sql` runs through the existing deployment
migration runner. New anonymous routes are explicitly allowed at the production
gateway. Gateway changes have no staging deployment and must be verified after
promotion. Staging deployments should set `EVENT_PAYMENTS_TEST_ONLY=true` and use
test Paystack accounts. `EVENT_COMMONLAB_URL`, `EVENT_COMMONS_URL` and
`EVENT_API_PUBLIC_URL` override canonical callback, page and webhook origins.

## Public guide

`POST /v1/project-pages/<slug>/chat` uses only published page context and current
aggregate registration information. It cannot run an owner's agent, use tools,
read project files or inspect personal registrations. Conversations live only in
the visitor's page memory. Per-IP limits and transactional daily page, owner and
platform budgets bound anonymous model use. Guide name, image and greeting are
owner-configurable; unavailable guides leave programme and registration usable.
