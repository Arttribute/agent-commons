# Payments and Educator Business Model

## Recommended Default

Agent Commons should be the merchant platform for course payments by default.
Learners pay through Agent Commons rails, and educators receive payouts through
configured subaccounts or scheduled transfers. Educators can bring their own
payment rails later, but that should be a higher-trust or enterprise setting.

This keeps learner refunds, course access, installment reconciliation, tax
records, fraud handling, and support in one system. It also gives Agent Commons
a clean way to charge platform fees when educators use hosted LMS, agents,
workflows, tools, storage, and compute.

## Supported Payment Lanes

- Stripe: default international card checkout.
- Paystack: Africa-first checkout, especially KES payments with M-Pesa/mobile
  money, cards, and bank transfer.
- Paystack subaccounts: preferred split model for educators when supported.
- Manual/scheduled transfers: fallback payout model where split settlement is
  not available or educator verification is incomplete.

Paystack docs relevant to this implementation:

- Payment channels: https://paystack.com/docs/payments/payment-channels/
- Charge API/mobile money: https://paystack.com/docs/api/charge/
- Split payments/subaccounts: https://paystack.com/docs/payments/split-payments/
- Transfers: https://paystack.com/docs/transfers/
- Webhooks: https://paystack.com/docs/payments/webhooks/

## Lipa Mdogo Mdogo

Installments should be a platform-level access model, not just a payment button.
The payment gateway records money movement, while Agent Commons decides what a
learner can access after each successful payment.

Recommended first policy:

- First installment unlocks module 1.
- Each later installment unlocks the next module.
- Completing the total course price upgrades the enrollment to full access.
- Educators can opt into installments per course.
- Courses can override the installment amount and count.

Future policy options:

- Full access after first payment for trusted learners or cohort courses.
- Weekly/monthly schedules with reminders.
- Grace windows before access is paused.
- Agent-mediated payment nudges over email, WhatsApp, or in-app notifications.

## Educator Tiers

Free tier:

- Host a small number of free courses.
- Basic course pages, lessons, and learner progress.
- No paid course sales, or limited pilot sales with higher platform fee.

Starter tier:

- Paid courses.
- Paystack/Stripe checkout through Agent Commons.
- Basic analytics and payout reporting.
- Platform fee per sale.

Growth tier:

- Lower platform fee.
- Lipa mdogo mdogo.
- Course bundles.
- Agent-assisted tutoring, assignments, workflow labs, and richer analytics.

Institution tier:

- Custom settlement terms.
- Bring-your-own-payment-provider option.
- Team seats, SSO, private cohorts, compliance exports, and dedicated support.

## Settlement Policy

Preferred mode: `platform_rails`.

The platform owns checkout, reconciles webhooks, grants access, and distributes
the educator share. Paystack subaccounts should be used where possible so
settlement is automatic. Otherwise, platform payouts can be done through
transfers after refund windows and risk checks.

Alternative mode: `educator_direct`.

The educator owns payment channels. This is simpler for cashflow but weaker for
the learner experience because Agent Commons must trust external confirmation
before unlocking content. Use this only for enterprise/private cohorts or
markets where platform payout is not operationally ready.

## Initial Platform Fees

Start simple:

- Agent Commons owned courses: 100% platform revenue.
- External educator free tier pilot: 25% platform fee on paid sales.
- Starter: 20% platform fee.
- Growth: 12% to 15% platform fee plus monthly subscription.
- Institution: negotiated.

Monthly educator subscriptions should be priced around infrastructure usage:

- LMS-only hosting stays low.
- Agent tutors, workflow execution, storage, tool calls, and cohort automation
  move educators into paid plans.
- Usage overages should be visible before they become surprising.

## Implementation Notes

The current app now has primitives for:

- Provider-neutral payments.
- Paystack checkout initialization.
- Paystack webhook verification.
- KES courses using Paystack by default.
- Course-level installment configuration.
- Partial enrollment access.
- Educator settlement metadata and Paystack subaccount codes.

The next production step is to add an educator onboarding UI and a payout ledger
so finance can reconcile every payment, refund, platform fee, and educator
balance without reading raw webhook logs.
