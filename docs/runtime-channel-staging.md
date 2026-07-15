# Managed runtime channel staging gate

OpenClaw and Hermes channel changes must pass this matrix on Agent Commons
staging before Agent Commons is promoted to `main`. CommonOS is developed and
deployed directly from `main`, so its control-plane and daemon changes act as
the canary dependency for this staging run.

## What Connect does

1. Saves encrypted channel credentials and the allowlist/home destination.
2. Redeploys the managed runtime so its gateway starts with the new config.
3. Runs the provider/runtime health probe in the runtime sidecar.
4. Completes QR pairing for linked-device WhatsApp, or approves a DM pairing
   code from the web UI when one is still required.
5. Sends a real verification message. The UI must not show **Connected** if
   delivery fails.

The runtime model also receives `cli_send_channel_message` only on explicit
Telegram, WhatsApp, Slack, or Discord send requests. The tool delivers through
the configured sidecar and uses the saved home destination when the user asks
to message "me" without a platform ID.

## Provider prerequisites

| Channel                | User-provided setup                                                         | Staging prerequisite                                                                                                |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Telegram               | Bot token and numeric user/chat ID                                          | User has sent `/start` to the bot                                                                                   |
| WhatsApp linked device | Allowed/destination phone number                                            | QR scan completes and the persisted session reconnects after the automatic gateway restart                          |
| WhatsApp Business API  | Phone number ID, access token, app secret, verify token, destination number | Meta app and phone number can send to the test destination                                                          |
| Slack                  | `xoxb-` bot token, `xapp-` app token, member/channel ID                     | Socket Mode enabled, app token has `connections:write`, bot has message scopes and is invited to the target channel |
| Discord                | Bot token and user/channel ID                                               | Message Content Intent enabled and bot invited with view/send/read-history permissions                              |

## Required matrix

Run every applicable row for both runtimes; WhatsApp Business API is currently
Hermes-only.

| Channel                        | Credential/QR probe | Inbound message | UI verification send | Agent request: “send hi to me” |
| ------------------------------ | ------------------- | --------------- | -------------------- | ------------------------------ |
| Telegram                       | [ ]                 | [ ]             | [ ]                  | [ ]                            |
| WhatsApp linked device         | [ ]                 | [ ]             | [ ]                  | [ ]                            |
| WhatsApp Business API (Hermes) | [ ]                 | [ ]             | [ ]                  | [ ]                            |
| Slack                          | [ ]                 | [ ]             | [ ]                  | [ ]                            |
| Discord                        | [ ]                 | [ ]             | [ ]                  | [ ]                            |

For pairing-policy coverage, remove the test user from the allowlist once per
runtime, send a DM, paste the displayed code into the web UI, and confirm both
the approval notification and verification message arrive.

## Diagnostics

If a row fails, record the API response from the channel action and the runtime
container logs. The automated sidecar operations correspond to:

- OpenClaw: `channels.status` with a provider probe, `pairing approve`,
  `channels login/logout` for WhatsApp, and `message send`.
- Hermes: provider REST probes, `pairing approve`, persistent `hermes whatsapp`
  QR state plus gateway restart, and `hermes send`.

Do not promote while a connector merely reports configured credentials; the
verification delivery and agent-initiated send are the acceptance criteria.
