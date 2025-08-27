// apps/commons-api/src/space/web-capture.service.ts
import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { EventEmitter } from 'events';
import { SpaceToolsService, SpaceToolSpec } from './space-tools.service';

interface CaptureSession {
  id: string;
  spaceId: string;
  url: string;
  browser: Browser;
  page: Page;
  isActive: boolean;
  participantId: string;
  createdAt: Date;
  retryCount: number;
}

@Injectable()
export class WebCaptureService extends EventEmitter {
  private readonly logger = new Logger(WebCaptureService.name);
  private sessions = new Map<string, CaptureSession>();
  private browser: Browser | null = null;

  constructor(private spaceTools: SpaceToolsService) {
    super();
  }

  async onModuleInit() {
    await this.initBrowserWithRetry();
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  private findChromiumExecutable(): string | null {
    // Prefer env overrides (e.g. on Vercel/Render/Heroku)
    const envPath =
      process.env.CHROME_PATH ||
      process.env.GOOGLE_CHROME_BIN ||
      process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath) return envPath;

    // When using the full `puppeteer` package, Chromium is bundled —
    // launch() will pick it automatically. Returning null = use bundled.
    return null;
  }

  private async initBrowserWithRetry(
    maxAttempts = 3,
    delayMs = 1500,
  ): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.initBrowser();
        return;
      } catch (err) {
        lastErr = err;
        this.logger.warn(
          `initBrowser attempt ${attempt}/${maxAttempts} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Failed to initialize browser after retries');
  }

  private async initBrowser(): Promise<void> {
    // Close existing browser if any
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        this.logger.warn(`Error closing existing browser: ${String(e)}`);
      }
      this.browser = null;
    }

    const executablePath = this.findChromiumExecutable();

    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-extensions',
        '--disable-gpu',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain',
        '--autoplay-policy=no-user-gesture-required',
        '--allow-running-insecure-content',
        '--enable-features=NetworkService',
        '--force-device-scale-factor=1',
        '--enable-webgl',
        '--use-gl=swiftshader',
        '--enable-accelerated-2d-canvas',
        '--disable-background-media-suspend',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--window-size=1280,720',
        // Add stability flags
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-translate',
        '--disable-domain-reliability',
        '--no-crash-upload',
        '--single-process', // Can help with stability but use carefully
      ],
      defaultViewport: { width: 1280, height: 720 },
      timeout: 60000, // Increase timeout
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      ignoreHTTPSErrors: true, // Add this for better compatibility
    };

    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    this.logger.log(
      `Launching browser with ${executablePath ? 'custom' : 'bundled'} Chromium...`,
    );

    this.browser = await puppeteer.launch(launchOptions);

    // Add better browser event handling
    this.browser.on('disconnected', () => {
      this.logger.warn('Browser disconnected unexpectedly');
      this.browser = null;

      // Stop all active sessions
      this.sessions.forEach(async (session) => {
        if (session.isActive) {
          session.isActive = false;
          this.sessions.delete(session.id);
        }
      });
    });

    this.browser.on('targetdestroyed', (target) => {
      try {
        this.logger.debug(`Browser target destroyed: ${target.url()}`);
      } catch {
        // ignore
      }
    });

    // Test browser connection
    const pages = await this.browser.pages();
    this.logger.log(
      `Browser launched successfully with ${pages.length} initial page(s).`,
    );
  }

  private async ensureBrowserConnection(): Promise<boolean> {
    if (!this.browser || !this.browser.isConnected()) {
      this.logger.log('Browser not connected, reinitializing...');
      try {
        await this.initBrowserWithRetry();
        return this.browser?.isConnected() ?? false;
      } catch (error) {
        this.logger.error('Failed to reinitialize browser:', error);
        return false;
      }
    }
    return true;
  }

  async startCapture(params: {
    sessionId: string;
    spaceId: string;
    url: string;
    participantId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Ensure browser is connected before proceeding
      const browserReady = await this.ensureBrowserConnection();
      if (!browserReady) {
        throw new Error('Browser failed to initialize or connect');
      }

      const validUrl = this.validateAndFormatUrl(params.url);
      this.logger.log(`Starting capture for URL: ${validUrl}`);

      // Add connection check before creating page
      if (!this.browser?.isConnected()) {
        throw new Error('Browser connection lost before page creation');
      }

      const page = await this.browser.newPage();

      // Add better error handling for page events
      page.on('error', (error) => {
        this.logger.error(
          `Page error for ${params.sessionId}: ${error.message}`,
          error.stack,
        );
        // Don't immediately stop capture on page errors, let it retry
      });

      page.on('pageerror', (error) => {
        this.logger.debug(
          `Page script error for ${params.sessionId}: ${error.message}`,
        );
      });

      // Add page close handler
      page.on('close', () => {
        this.logger.warn(`Page closed for session ${params.sessionId}`);
        const session = this.sessions.get(params.sessionId);
        if (session) {
          session.isActive = false;
        }
      });

      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      });

      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        const url = request.url();

        const shouldBlock =
          url.includes('google-analytics') ||
          url.includes('googletagmanager') ||
          url.includes('facebook.com/tr') ||
          url.includes('doubleclick') ||
          url.includes('googlesyndication') ||
          url.includes('carbonads') ||
          url.includes('hotjar') ||
          url.includes('mixpanel') ||
          url.includes('segment.com') ||
          url.includes('amplitude.com') ||
          url.includes('intercom.io') ||
          url.includes('zendesk.com') ||
          // block very large direct files while allowing HLS/DASH streaming
          (resourceType === 'media' &&
            /\.(mp4|webm)(\?.*)?$/i.test(url) &&
            /size=large|4k/i.test(url));

        if (shouldBlock) request.abort();
        else request.continue();
      });

      // Add init script as STRING to avoid server-side DOM typings
      const AUTOPLAY_INIT = `
        (function () {
          try {
            const origPlay = HTMLMediaElement && HTMLMediaElement.prototype && HTMLMediaElement.prototype.play
              ? HTMLMediaElement.prototype.play
              : null;
            if (origPlay) {
              HTMLMediaElement.prototype.play = function () {
                try { this.muted = true; this.setAttribute('muted','true'); } catch {}
                try { this.setAttribute('autoplay','true'); this.setAttribute('playsinline','true'); } catch {}
                return origPlay.call(this);
              };
            }

            const forceVideo = function (root) {
              try {
                var vids = (root || document).querySelectorAll('video');
                vids.forEach(function (v) {
                  try {
                    v.muted = true;
                    v.autoplay = true;
                    v.playsInline = true;
                    if (v.hasAttribute('poster')) v.removeAttribute('poster');
                    v.play().catch(function(){});
                  } catch {}
                });
              } catch {}
            };

            // Observe dynamically added nodes
            try {
              var obs = new MutationObserver(function (mutations) {
                mutations.forEach(function (m) {
                  m.addedNodes && m.addedNodes.forEach(function (node) {
                    if (node && node.querySelectorAll) forceVideo(node);
                  });
                });
              });
              obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
            } catch {}

            // First pass
            forceVideo(document);

            // Nudge lazy loaders
            try { window.dispatchEvent(new Event('scroll')); } catch {}
          } catch (e) { /* silent */ }
        })();
      `;
      await page.evaluateOnNewDocument(AUTOPLAY_INIT);

      // Set permissions (valid puppeteer Permission strings; 'autoplay' is NOT valid)
      const context = this.browser.defaultBrowserContext();
      await context.overridePermissions(validUrl, ['camera', 'microphone']);

      // Navigate
      try {
        this.logger.log(`Navigating to: ${validUrl}`);
        await page.goto(validUrl, {
          waitUntil: 'networkidle2',
          timeout: 25000,
        });
        this.logger.log(`Successfully navigated to: ${validUrl}`);
      } catch (navigationError) {
        this.logger.warn(
          `Navigation timeout/error, continuing with current state: ${
            navigationError instanceof Error
              ? navigationError.message
              : String(navigationError)
          }`,
        );
      }

      // Attempt to discover space tools at {pageUrl}/common-agent-tools/
      try {
        const toolsEndpoint = new URL(validUrl);
        // ensure trailing slash before appending path segment if needed
        const baseOrigin = `${toolsEndpoint.origin}`;
        const basePath = toolsEndpoint.pathname.endsWith('/')
          ? toolsEndpoint.pathname.slice(0, -1)
          : toolsEndpoint.pathname;
        const discoverUrl = `${baseOrigin}${basePath}/common-agent-tools/`;
        this.logger.log(`Attempting space tools discovery at ${discoverUrl}`);
        const resp = await fetch(discoverUrl, { method: 'GET' });
        if (resp.ok) {
          const json = await resp.json();
          // Accept single tool object or array
          const specs: SpaceToolSpec[] = Array.isArray(json) ? json : [json];
          const validSpecs = specs.filter((t) => t && t.name && t.apiSpec);
          if (validSpecs.length) {
            this.spaceTools.upsertTools(
              params.spaceId,
              discoverUrl,
              validSpecs,
            );
            this.logger.log(
              `Discovered ${validSpecs.length} tool spec(s) for space ${params.spaceId}`,
            );
          } else {
            this.logger.log(
              `No valid tool specs found at discovery endpoint for space ${params.spaceId}.`,
            );
          }
        } else {
          this.logger.debug(
            `Space tools discovery endpoint returned status ${resp.status} for ${discoverUrl}`,
          );
        }
      } catch (discErr) {
        this.logger.debug(
          `Space tools discovery failed: ${discErr instanceof Error ? discErr.message : String(discErr)}`,
        );
      }

      // Inspect videos (cast the function to any to bypass DOM typings)
      try {
        const videoInfo = await page.evaluate(() => {
          const videos = Array.from(
            (globalThis as any).document.querySelectorAll('video'),
          );
          return videos.map((v: any) => ({
            src: v.src || v.currentSrc,
            paused: !!v.paused,
            duration: Number.isFinite(v.duration) ? v.duration : null,
            currentTime: v.currentTime ?? null,
            readyState: v.readyState ?? null,
          }));
        });
        this.logger.log(
          `Found ${videoInfo.length} video(s) on page: ${JSON.stringify(videoInfo)}`,
        );
      } catch {
        this.logger.debug('Could not evaluate video status');
      }

      const session: CaptureSession = {
        id: params.sessionId,
        spaceId: params.spaceId,
        url: validUrl,
        browser: this.browser,
        page,
        isActive: true,
        participantId: params.participantId,
        createdAt: new Date(),
        retryCount: 0,
      };

      this.sessions.set(params.sessionId, session);

      // Start frame capture with better error handling
      setTimeout(() => {
        if (session.isActive && this.browser?.isConnected()) {
          this.startFrameCapture(session);
        } else {
          this.logger.warn(
            `Session ${params.sessionId} inactive or browser disconnected, not starting frame capture`,
          );
        }
      }, 1000);

      this.logger.log(
        `Started web capture for ${validUrl} in space ${params.spaceId}`,
      );
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to start web capture: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Clean up session if it was created
      if (this.sessions.has(params.sessionId)) {
        await this.stopCapture(params.sessionId);
      }

      return { success: false, error: errorMessage };
    }
  }

  private validateAndFormatUrl(url: string): string {
    let u = url;
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u;
    }
    try {
      // throws on invalid
      // eslint-disable-next-line no-new
      new URL(u);
      return u;
    } catch {
      throw new Error('Invalid URL format');
    }
  }

  private async startFrameCapture(session: CaptureSession) {
    const captureFrame = async () => {
      if (!session.isActive) return;

      try {
        // Check if browser and page are still valid
        if (!session.browser?.isConnected() || session.page.isClosed()) {
          this.logger.warn(
            `Browser/page disconnected for session ${session.id}`,
          );

          // Attempt to recover if retry count is low
          if (session.retryCount < 3) {
            session.retryCount++;
            this.logger.log(
              `Attempting to recover session ${session.id}, retry ${session.retryCount}`,
            );

            try {
              // Try to reinitialize browser and recreate page
              await this.initBrowserWithRetry();
              if (this.browser?.isConnected()) {
                const newPage = await this.browser.newPage();
                await newPage.goto(session.url, {
                  waitUntil: 'networkidle2',
                  timeout: 15000,
                });
                session.page = newPage;
                session.browser = this.browser;

                // Continue with frame capture
                setTimeout(captureFrame, 1000);
                return;
              }
            } catch (recoveryError) {
              this.logger.error(
                `Recovery failed for session ${session.id}:`,
                recoveryError,
              );
            }
          }

          await this.stopCapture(session.id);
          return;
        }

        const screenshot = await session.page.screenshot({
          type: 'jpeg',
          quality: 80,
          fullPage: false,
        });

        this.emit('frame', {
          sessionId: session.id,
          spaceId: session.spaceId,
          participantId: session.participantId,
          frameData: screenshot,
          timestamp: Date.now(),
        });

        if (session.isActive) {
          setTimeout(captureFrame, 66); // ~15 FPS
        }
      } catch (error) {
        this.logger.error(
          `Frame capture error for session ${session.id}: ${String(error)}`,
        );

        // Don't immediately stop on single frame errors, allow some retries
        if (session.retryCount < 5) {
          session.retryCount++;
          this.logger.log(
            `Retrying frame capture for session ${session.id}, attempt ${session.retryCount}`,
          );
          setTimeout(captureFrame, 2000); // Wait longer before retry
        } else {
          await this.stopCapture(session.id);
        }
      }
    };

    captureFrame();
  }

  async stopCapture(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      session.isActive = false;
      await session.page.close();
      this.sessions.delete(sessionId);

      this.logger.log(`Stopped web capture session ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Error stopping capture session ${sessionId}: ${String(error)}`,
      );
      return false;
    }
  }

  getActiveCaptures(spaceId: string): CaptureSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.spaceId === spaceId && s.isActive,
    );
  }

  async navigateToUrl(sessionId: string, newUrl: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      const validUrl = this.validateAndFormatUrl(newUrl);
      await session.page.goto(validUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      session.url = validUrl;
      return true;
    } catch (error) {
      this.logger.error(
        `Navigation error for session ${sessionId}: ${String(error)}`,
      );
      return false;
    }
  }

  private async cleanup() {
    for (const session of this.sessions.values()) {
      session.isActive = false;
      try {
        await session.page.close();
      } catch (error) {
        this.logger.error('Error closing page:', String(error));
      }
    }
    this.sessions.clear();

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        this.logger.error('Error closing browser:', String(error));
      } finally {
        this.browser = null;
      }
    }
  }
}
