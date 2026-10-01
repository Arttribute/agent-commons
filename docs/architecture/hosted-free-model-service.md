# Hosted free model service for Cloud sessions

This plan covers the browser and Cloud fallback requested for people who exhaust Commons credits. The repository has a gated API integration, daily quota migration, and billing fallback, but no hosted GPU service. The free model remains hidden until `HOSTED_FREE_MODEL_BASE_URL` and `HOSTED_FREE_MODEL_API_KEY` are configured. Private Local sessions continue to use models on the user's computer.

## Proposed model and deployment

The first **candidate** is the official Apache 2.0 `Qwen/Qwen3-1.7B-FP8` checkpoint, revision `1641e6c1b620b7ed7e8711b443990429a23b1b99`. Its 2,654,425,984-byte `model.safetensors` has publisher SHA-256 `8a9a9202762899cfa7c69a59a4d950ba38b3779323b93085dd1971fdf1d2b85a`. Pin and verify those bytes in the model cache and pin the vLLM image digest before deployment. The API now uses this exact model ID for the gated fallback. This is a memory-fit candidate, **not an accepted quality default**: the small model must pass real Commons document, coding, tool-call, citation, and multilingual tasks before the fallback is enabled.

Start with one private inference replica and an 8,192-token server context limit, 2,048 output-token cap, and one concurrent sequence. The API conservatively limits estimated prompt-plus-output tokens to 6,000 and binds at most 20 tools per call to leave room for tool schemas and tokenizer error. Use vLLM's OpenAI-compatible API with automatic Hermes tool parsing. Disable Qwen3 thinking by default at the server so a 2,048-token output allowance is not silently spent on hidden reasoning. Verify these provisional settings against peak GPU memory and task quality; change the API limits and server limit together if the benchmark supports it.

Run inference in a separate GPU service in `eu-west-2`, where the candidate instance is offered; the API currently runs in `eu-west-1`. Place inference in private subnets and connect the two VPCs through a private cross-region path with explicit security groups and authenticated requests. The browser must never receive its address or service credential. Publish health, queue depth, request latency, token throughput, GPU memory, and failures. Keep a rolling replacement path and a warm model cache so restarts do not cause repeated weight downloads.

The available `g6f.2xlarge` configuration has a 5.59 GiB GPU slice. The 2.65 GB checkpoint leaves room for the runtime and KV cache on paper; only an actual warm-load and concurrent-request test can establish whether it fits. Final instance size, capacity, latency, and cost require a benchmark in the target region. The G/VT quota request is still pending.

Sources: [official Qwen checkpoint and license](https://huggingface.co/Qwen/Qwen3-1.7B-FP8), [checkpoint metadata](https://huggingface.co/api/models/Qwen/Qwen3-1.7B-FP8?blobs=true), [AWS GPU specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/ac.html), [vLLM Qwen tool-call example](https://docs.vllm.ai/en/stable/examples/tool_calling/openai_responses_client_with_tools/), [vLLM thinking-mode defaults](https://docs.vllm.ai/en/stable/features/reasoning_outputs/).

## Cloud routing and billing

1. Give the hosted model a distinct internal model ID and expose it as **Free model** only after its health check passes. Do not treat any user supplied Ollama URL as the hosted service.
2. When a managed paid run fails its initial credit reservation for insufficient balance, switch to the free model before inference starts, retaining the draft, attachments, project, and session. Emit a visible status event and record the actual model in provenance. A user may also select the free model directly.
3. Resolve the hosted endpoint and credentials on the server. Mark free usage explicitly in run provenance and usage events. Never charge the user for its tokens; retain token counts for abuse controls and capacity planning.
4. The API migration `038_hosted_free_model_quota.sql` implements atomic per-account and global daily request and reserved-token allowances. The run gate limits concurrent runs to two per account and eight globally; stale runs expire from this count after six hours. Each model call reserves its estimated input plus at most 2,048 output tokens and rejects estimates above 6,000 tokens. The run count is an API admission limit, not a promise of eight simultaneous GPU sequences; measure queue wait and set a stricter cap if the single-sequence service cannot meet latency targets. The API returns the next UTC reset time when a daily allowance is exhausted. Keep authenticated identity and workspace authorization in the API; reject anonymous inference.
5. Keep tool permissions unchanged when switching models. The model must pass the existing tool call validation. The fallback is text and tool capable; media generation remains a separate capability with its own cost and limits.
6. Fail closed when the GPU is unhealthy or saturated. Show an actionable unavailable state and keep the user's draft. Do not route private local data to this service.

## Delivery gates

1. Deploy and load test the isolated inference service in staging. Confirm model license, regional GPU quota, measured cost per 1,000 generated tokens, peak memory, cold start, and queue behavior.
2. Configure the internal endpoint secret only after the GPU is running. The model registry entry, free usage ledger, and paid-reservation fallback are implemented. A real SQL integration check verifies request and token counters, rollback on exhaustion, and no credit reservation for free runs. Multi-replica concurrency and the production database schema still need a staging test.
3. Verify that a failed paid reservation creates no paid usage and a free run creates no credit debit in staging. The API exposes the free model in the catalog when configured; confirm its choice in the composer and the fallback status in both web and desktop Cloud views.
4. Run agent tasks that require project context, large uploaded documents, web tools, and coding tools. Compare answer quality and tool completion with the paid default. Test reconnecting to an active streamed run.
5. Roll out to a small cohort with a spending ceiling and alerts, then enable the default fallback after the service and ledger remain healthy under real traffic.

## Budget and capacity check (30 September 2026)

The approved ceiling is **$500 USD per month** for this account. An AWS monthly cost budget named `AgentCommons-total-500` now records that ceiling. AWS Budgets is an alerting/accounting feature, not a hard spending limit; any deployment must also enforce a runtime cap and reserve headroom for storage, network, and the existing API. The account's September unblended cost query was effectively zero when checked.

The API runs in `eu-west-1`, where EC2 currently lists no G6f offering. `g6f.2xlarge` is offered in `eu-west-2` at **$0.60298 per hour** on demand in the AWS Pricing API, or about **$440.18 for 730 hours** before storage, transfer, and other service costs. Its on-demand G/VT vCPU quota was zero. An increase to eight vCPUs was requested and is pending. The previously proposed full precision 4B model does not fit this 5.59 GiB slice; the pinned 1.7B FP8 candidate still needs a GPU memory and quality benchmark. A cross-region authenticated endpoint and an enforced cap on GPU running hours are required to stay below $500. The existing AWS Budget sends alerts and does not enforce that cap.

The GPU service and capacity reservation are **not deployed**. The API keeps the fallback disabled without its endpoint and key. Do not enable the fallback based only on the budget or quota request.
