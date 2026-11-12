# Programme registration in Common Courses

A camp, workshop or event is a Course with `registration.enabled: true`. Its price, currency, educator owner, collaborators, discounts, Paystack connection, enrolments, payments and payout ledger use the existing Common Courses system.

The public branded page is `/register/:courseSlug`. The same page handles one or more participants, guardian contact details, approved custom questions, consent, code quotes, hosted Paystack payment and an opaque receipt. Course checkout automatically redirects programmes to this form. Participants do not need personal accounts.

## Educator workflow

Open the course in the educator console. Sales contains programme registration settings and existing promo codes. Payments contains all transactions, registration details and a private CSV export. Collaborator access uses the normal course permissions. Pending payments do not confirm places. A completed payment marked for review needs organiser follow-up.

Configure the title, price and currency on the course. Set total capacity with `maxEnrollments`. `registration` supplies display timing, location, participant labels, maximum per booking, fields, consent wording, practical terms, support contact, a linked public `pageSlug`, and optional logo. Course description, brand colours and banner supply the registration page’s branding.

Custom `fields` support `text`, `select` and `checkbox`, with a unique key, label, required flag and select options. The same configuration can be supplied through the owner course API by any authoring tool. The public API never returns access code definitions or registration contacts.

## One payment record

Each booking is an existing Payment row. `metadata.registration` contains participant choices, parent contact, agreement snapshot, an idempotency key and a 20-minute seat hold. Successful verification uses the existing enrolment, access-code conversion and payout-ledger functions. Guardian accounts can have multiple bookings; the payment rows retain each booking’s participant details.

Transactions serialize on the course before checking capacity or code reservations. Active pending checkouts and confirmed participants consume places. Expired holds release them. A late payment that cannot fit, a used-up code allocation, or mismatching payment details goes to review and does not grant a place. Receipts expose the opaque reference, quantity and payment status, without family contact details.

Paystack uses the existing Common Courses secret, callback and webhook. No second payment account or payment database is required. The API never accepts a client-provided price as authority, and checks reference, successful status, amount, currency and test/live domain before confirmation.

## Custom landing pages and guides

A Commons project page can link `registrationSlug` to the Common Courses programme slug. `openRegistration()` opens the host’s registration link in the same tab, so a page made with another tool can keep its own content and visual style. The public guide uses only approved published programme facts. It does not run an owner’s private agent or access registration records.

## Verification

`node --test scripts/course-registration.test.cjs` runs against `MONGODB_TEST_URI`, a Mongo replica set. It creates a uniquely named disposable test database, mocks Paystack and removes that database at the end. It verifies KSh 10 pricing, idempotency, concurrent capacity and code limits, repeated callbacks, the shared enrolment and ledger, late payments, mismatches, free discounts and receipt privacy. CI starts its own Mongo replica set for this check.
