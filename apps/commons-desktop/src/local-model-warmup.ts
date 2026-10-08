import { assertReviewedModelDigest } from "./reviewed-model-digests";
import { LOCAL_CONTEXT_SIZE } from "./local-chat-history";
import { localMemoryPressureHigh } from "./local-memory-pressure";

export const LOCAL_MODEL_KEEP_ALIVE = "5m";
export type WarmupTarget = { endpoint: string; model: string };

/** Empty requests load only weights and the chat-sized context; no inference or downloads. */
export class LocalModelWarmup {
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private foreground = 0;
  private closed = false;
  private active = true;
  private selected?: WarmupTarget;
  private warmed?: WarmupTarget;
  private pausedUntil = 0;
  private readonly renewal: ReturnType<typeof setInterval>;
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly delayMs = 350,
    private readonly pressureHigh: () => Promise<boolean> = localMemoryPressureHigh,
    private readonly ownsServer: () => boolean = () => false,
    private readonly renewalMs = 60_000,
  ) {
    this.renewal = setInterval(
      () => void this.maintain().catch(() => undefined),
      renewalMs,
    );
    this.renewal.unref?.();
  }

  setActive(active: boolean) {
    this.active = active;
    this.cancel();
    if (active && this.selected) this.schedule(this.selected);
  }

  private async maintain() {
    if (this.closed || this.foreground || this.controller) return;
    const high = await this.pressureHigh();
    if (this.closed || this.foreground || this.controller) return;
    if (high) {
      this.pausedUntil = Date.now() + 120_000;
      if (this.warmed && this.ownsServer()) await this.releaseOwnedModel();
      return;
    }
    if (this.active && this.selected && Date.now() >= this.pausedUntil)
      this.schedule(this.selected);
  }

  private async releaseOwnedModel() {
    const target = this.warmed;
    if (!target || this.foreground || !this.ownsServer()) return;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(5000),
      ]);
      const response = await this.request(`${target.endpoint}/api/ps`, {
        signal,
        redirect: "error",
      });
      if (!response.ok) return;
      const resident = (await response.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      if (
        !resident.models?.some(
          (entry) =>
            (entry.name ?? entry.model) === target.model ||
            (entry.name ?? entry.model) === `${target.model}:latest`,
        )
      )
        return;
      signal.throwIfAborted();
      await this.request(`${target.endpoint}/api/generate`, {
        method: "POST",
        signal,
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: target.model, keep_alive: 0 }),
      }).then((r) => r.body?.cancel());
      this.warmed = undefined;
    } catch {
      /* Active inference or account changes take precedence. */
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  schedule(target: WarmupTarget) {
    this.cancel();
    this.selected = target;
    if (
      this.closed ||
      !this.active ||
      this.foreground ||
      Date.now() < this.pausedUntil ||
      !target.model.trim()
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.closed || this.foreground) return;
      const controller = new AbortController();
      this.controller = controller;
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(60_000),
      ]);
      void this.pressureHigh()
        .then(async (high) => {
          signal.throwIfAborted();
          if (high) {
            this.pausedUntil = Date.now() + 120_000;
            return;
          }
          await this.load(target, signal);
        })
        .catch(() => undefined) // Foreground setup reports actionable failures; warm-up stays optional.
        .finally(() => {
          if (this.controller === controller) this.controller = undefined;
        });
    }, this.delayMs);
    this.timer.unref?.();
  }

  beginForeground() {
    this.foreground++;
    this.cancel();
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.foreground--;
      }
    };
  }

  forget() {
    this.cancel();
    this.selected = undefined;
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    this.controller = undefined;
  }
  close() {
    this.closed = true;
    clearInterval(this.renewal);
    this.cancel();
  }

  private async load({ endpoint, model }: WarmupTarget, signal: AbortSignal) {
    const tags = await this.request(`${endpoint}/api/tags`, {
      redirect: "error",
      signal,
    });
    if (!tags.ok) return;
    const payload = (await tags.json()) as {
      models?: Array<{ name?: string; model?: string; digest?: string }>;
    };
    const installed = payload.models?.find(
      (entry) =>
        (entry.name ?? entry.model) === model ||
        (entry.name ?? entry.model) === `${model}:latest`,
    );
    if (!installed) return;
    assertReviewedModelDigest(model, installed.digest);
    signal.throwIfAborted();
    // An independently managed Ollama may already be serving another app.
    // Avoid allocating an extra background model on that user's server.
    if (!this.ownsServer()) {
      const ps = await this.request(`${endpoint}/api/ps`, {
        redirect: "error",
        signal,
      });
      if (!ps.ok) return;
      const resident = (await ps.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      if (
        resident.models?.length &&
        !resident.models.some(
          (entry) =>
            (entry.name ?? entry.model) === model ||
            (entry.name ?? entry.model) === `${model}:latest`,
        )
      )
        return;
      signal.throwIfAborted();
    }
    const response = await this.request(`${endpoint}/api/generate`, {
      method: "POST",
      redirect: "error",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: "",
        stream: false,
        keep_alive: LOCAL_MODEL_KEEP_ALIVE,
        options: { num_ctx: LOCAL_CONTEXT_SIZE },
      }),
    });
    await response.body?.cancel();
    signal.throwIfAborted();
    this.warmed = { endpoint, model };
  }
}

// Deliberately narrow: tasks, follow-ups and any attached/project/canvas context use the full harness.
export function isOpeningGreeting(prompt: string) {
  return /^(?:hi|hello|hey|hiya|howdy|wagwan|good (?:morning|afternoon|evening))[!.\s]*$/i.test(
    prompt.trim(),
  );
}
