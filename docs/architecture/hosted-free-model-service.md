# Hosted free model service for Cloud sessions

This plan covers the browser and Cloud fallback requested for people who exhaust Commons credits. The repository has a gated API integration, daily quota migration, and billing fallback, but no hosted GPU service. The free model remains hidden until `HOSTED_FREE_MODEL_BASE_URL` and `HOSTED_FREE_MODEL_API_KEY` are configured. Private Local sessions continue to use models on the user's computer.

## Proposed model and deployment

Use Qwen3 4B Instruct 2507 as the first hosted chat model. Its published license is Apache 2.0. Start with one inference replica on an AWS G6 instance with an NVIDIA L4 GPU, using vLLM's OpenAI compatible API. Pin the model revision, image digest, tokenizer settings, context limit, and output limit before rollout. Benchmark tool calling, citations, coding, and multilingual prompts against the existing Commons agent loop before accepting the model.

Run inference in a separate ECS service on GPU backed EC2 capacity in the same AWS region as the API. Place the service in private subnets; expose it only to the API service through internal discovery and security groups. The browser must never receive its address or service credential. Publish health, queue depth, request latency, token throughput, GPU memory, and failures. Keep a rolling replacement path and a warm model cache so restarts do not cause repeated weight downloads.

AWS documents GPU task allocation for ECS on EC2 and lists 22 GiB of accelerator memory for a G6 L4 instance. Final instance size, capacity, and cost require a benchmark in the target region; this plan does not assume a GPU quota or an approved spending limit.

Sources: [Qwen model and license](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), [AWS GPU tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-gpu.html), [AWS G6 specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/ac.html), [vLLM server](https://docs.vllm.ai/en/latest/serving/openai_compatible_server/).

## Cloud routing and billing

1. Give the hosted model a distinct internal model ID and expose it as **Free model** only after its health check passes. Do not treat any user supplied Ollama URL as the hosted service.
2. When a managed paid run fails its initial credit reservation for insufficient balance, switch to the free model before inference starts, retaining the draft, attachments, project, and session. Emit a visible status event and record the actual model in provenance. A user may also select the free model directly.
3. Resolve the hosted endpoint and credentials on the server. Mark free usage explicitly in run provenance and usage events. Never charge the user for its tokens; retain token counts for abuse controls and capacity planning.
4. The API migration `038_hosted_free_model_quota.sql` implements atomic per-account and global daily request and reserved-token allowances. The run gate limits concurrent runs to two per account and eight globally; stale runs expire from this count after six hours. Each model call reserves its estimated input plus at most 2,048 output tokens. The API rejects oversized contexts and returns the next UTC reset time when a daily allowance is exhausted. Keep authenticated identity and workspace authorization in the API; reject anonymous inference.
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

The API runs in `eu-west-1`, where EC2 currently lists no G6f offering. `g6f.2xlarge` is offered in `eu-west-2` at **$0.60298 per hour** on demand in the AWS Pricing API, or about **$440.18 for 730 hours** before storage, transfer, and other service costs. Its on-demand G/VT vCPU quota was zero. An increase to eight vCPUs was requested and is pending. The previously proposed full G6 L4 plan must be re-benchmarked against this smaller 5.59 GiB GPU slice before any deployment. In particular, a full precision 4B model does not fit as originally described; a smaller model or a verified quantized checkpoint is required. A cross-region authenticated endpoint and a cap on GPU running hours are also required to stay below $500.

The GPU service and capacity reservation are **not deployed**. The API keeps the fallback disabled without its endpoint and key. Do not enable the fallback based only on the budget or quota request.
