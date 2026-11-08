"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  MessageSquare,
  Upload,
  Save,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { InfoHint } from "@/components/ui/info-hint";
import { useAgentContext } from "@/context/AgentContext";
import {
  projectPagesApi,
  type PageConfig,
  type ProjectPage,
} from "@/hooks/use-project-pages";
export function ProjectPageEditor({
  projectId,
  pageId,
}: {
  projectId: string;
  pageId: string;
}) {
  const router = useRouter();
  const query = useSearchParams();
  const tab = ["preview", "source", "settings"].includes(query.get("tab") || "")
    ? query.get("tab")!
    : "preview";
  const [page, setPage] = useState<ProjectPage | null>(null);
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [active, setActive] = useState("");
  const [preview, setPreview] = useState("");
  const [size, setSize] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [upload, setUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { setInputText } = useAgentContext();
  const load = useCallback(async () => {
    try {
      const value = await projectPagesApi.get(projectId, pageId);
      setPage(value);
      setConfig(value.draftConfig);
      setActive(
        (p) => p || value.source?.files.find((f) => !f.binary)?.path || "",
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the page");
    }
  }, [projectId, pageId]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action failed");
    } finally {
      setBusy("");
    }
  };
  const sourceDirty = Object.keys(drafts).length > 0;
  const settingsDirty = Boolean(
    page &&
      config &&
      JSON.stringify(page.draftConfig) !== JSON.stringify(config),
  );
  const dirty = sourceDirty || settingsDirty;
  if (!page || !config)
    return (
      <div className="p-6">
        {error ? (
          <p role="alert">
            {error}{" "}
            <button onClick={() => void load()} className="underline">
              Retry
            </button>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Loading page…</p>
        )}
      </div>
    );
  const source = page.source?.files.find((f) => f.path === active);
  const save = () =>
    run("save", async () => {
      if (sourceDirty) {
        const v = await projectPagesApi.files(
          projectId,
          pageId,
          Object.entries(drafts).map(([path, content]) => ({ path, content })),
        );
        setPage(v);
        setDrafts({});
      }
      if (settingsDirty) {
        const v = await projectPagesApi.update(projectId, pageId, config);
        setPage(v);
        setConfig(v.draftConfig);
      }
      setNotice("Draft saved. Publish when you want to update the live page.");
    });
  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-white px-5 py-4">
        <Link
          href={`/projects/${projectId}`}
          className="rounded-lg p-1.5"
          aria-label="Back to project"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-medium">
            {page.draftConfig.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {page.status === "published" ? "Published" : "Draft"} · /p/
            {page.slug}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUpload(true)}
          disabled={!!busy}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          Import build
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setInputText(
              `Help me edit this project page. Read the code project first using readCodeProject with agentId ${page.source?.agentId} and projectId ${page.codeProjectId}. The parent Commons project is ${projectId}. Make changes with writeCodeProjectFiles; preserve all binary assets. The source files include the page's design and content, including camp.config.json for registration links when present. Keep private registration or guardian data out of public source. Do not publish automatically; I will review the preview and publish from the page view.`,
            );
            router.push(`/projects/${projectId}`);
          }}
        >
          <MessageSquare className="mr-1.5 h-4 w-4" />
          Edit with chat
        </Button>
        {page.status === "published" && (
          <Button variant="ghost" size="sm" asChild>
            <a href={page.publicPath} target="_blank" rel="noopener noreferrer">
              Open <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        <Button
          size="sm"
          disabled={!!busy || dirty}
          onClick={() =>
            void run("publish", async () => {
              await projectPagesApi.action(projectId, pageId, "publish");
              await load();
              setNotice("Page published.");
            })
          }
        >
          {busy === "publish" ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Globe className="mr-1.5 h-4 w-4" />
          )}
          Publish page
        </Button>
      </header>
      <div className="flex shrink-0 items-center gap-5 border-b bg-white px-6">
        {["preview", "source", "settings"].map((t) => (
          <button
            key={t}
            className={`border-b-2 px-1 py-3 text-sm ${tab === t ? "border-stone-900 font-medium" : "border-transparent text-muted-foreground"}`}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => router.replace(`?tab=${t}`, { scroll: false })}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {(error || notice || dirty) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3 text-sm">
          <p
            role={error ? "alert" : "status"}
            className={error ? "text-red-700" : "text-muted-foreground"}
          >
            {error ||
              notice ||
              (dirty
                ? "Unsaved changes. Save before previewing or publishing."
                : "")}
          </p>
          {dirty && (
            <Button size="sm" disabled={!!busy} onClick={() => void save()}>
              <Save className="mr-1.5 h-4 w-4" />
              Save draft
            </Button>
          )}
        </div>
      )}
      {tab === "preview" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!!busy || dirty}
                onClick={() =>
                  void run("preview", async () => {
                    const v = await projectPagesApi.action(
                      projectId,
                      pageId,
                      "preview",
                    );
                    setPreview(v.publicUrl);
                    setNotice(
                      "Unlisted preview link created. The live page has not changed.",
                    );
                  })
                }
              >
                {busy === "preview" && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Build preview link
              </Button>
              <InfoHint label="Preview visibility">
                This creates an unlisted public link that anyone with it can
                view. It does not update the live page.
              </InfoHint>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={size === "desktop" ? "secondary" : "ghost"}
                onClick={() => setSize("desktop")}
              >
                Desktop
              </Button>
              <Button
                size="sm"
                variant={size === "mobile" ? "secondary" : "ghost"}
                onClick={() => setSize("mobile")}
              >
                Mobile
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            {preview ? (
              <iframe
                className={`mx-auto h-full min-h-[520px] border bg-white ${size === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
                title="Unlisted page preview"
                src={preview}
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                Build a preview link to see your page.
              </div>
            )}
          </div>
        </div>
      ) : tab === "source" ? (
        <div className="flex min-h-0 flex-1">
          <nav
            className="w-52 shrink-0 overflow-y-auto border-r bg-white p-3 max-md:w-36"
            aria-label="Source files"
          >
            {page.source?.files.map((f) => (
              <button
                key={f.path}
                onClick={() => setActive(f.path)}
                className={`block w-full truncate rounded-lg px-2 py-2 text-left text-xs ${active === f.path ? "bg-muted font-medium" : ""}`}
                title={f.path}
              >
                {f.path}
                {drafts[f.path] !== undefined ? " *" : ""}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 p-4">
            {source?.binary ? (
              <p className="text-sm text-muted-foreground">
                This is a binary asset. Replace it from your coding tool and
                import the updated build.
              </p>
            ) : source ? (
              <Textarea
                className="h-full resize-none font-mono text-xs"
                aria-label={`Source for ${active}`}
                value={drafts[active] ?? source.content}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [active]: e.target.value }))
                }
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl space-y-5">
            <div>
              <Label htmlFor="settings-title">Page title</Label>
              <Input
                id="settings-title"
                value={config.title}
                onChange={(e) =>
                  setConfig({ ...config, title: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="settings-description">
                Search and link description
              </Label>
              <Textarea
                id="settings-description"
                maxLength={500}
                value={config.description}
                onChange={(e) =>
                  setConfig({ ...config, description: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="settings-image">Link-preview image URL</Label>
              <Input
                type="url"
                id="settings-image"
                value={config.imageUrl ?? ""}
                onChange={(e) =>
                  setConfig({ ...config, imageUrl: e.target.value })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="settings-chat"
                checked={config.chatEnabled}
                onCheckedChange={(v) =>
                  setConfig({ ...config, chatEnabled: v === true })
                }
              />
              <Label htmlFor="settings-chat">
                Allow visitors to open a Commons chat draft
              </Label>
            </div>
            <div>
              <Label htmlFor="settings-context">
                Published information for chat
              </Label>
              <Textarea
                id="settings-context"
                className="min-h-48"
                maxLength={12000}
                value={config.publicContext}
                onChange={(e) =>
                  setConfig({ ...config, publicContext: e.target.value })
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Only this public text is passed to visitors. Private project
                instructions and knowledge stay private.
              </p>
            </div>
            {page.status === "published" && (
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void run("unpublish", async () => {
                    await projectPagesApi.action(
                      projectId,
                      pageId,
                      "unpublish",
                    );
                    setPreview("");
                    await load();
                    setNotice("Page and preview assets are no longer public.");
                  })
                }
              >
                Unpublish page
              </Button>
            )}
          </div>
        </div>
      )}
      <Drawer open={upload} onOpenChange={setUpload}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-xl p-5">
            <DrawerHeader className="px-0">
              <DrawerTitle>Import your web build</DrawerTitle>
              <DrawerDescription>
                Use your preferred coding tool, export a static browser build
                and ZIP the output folder’s contents. Include index.html,
                scripts, styles and assets. Importing replaces the draft files;
                the live page stays on its published version.
              </DrawerDescription>
            </DrawerHeader>
            <Input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-label="Website ZIP"
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Browser uploads: up to 3 MB. The import API accepts ZIPs up to 8
              MB. Server-side frameworks need a static export.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <DrawerFooter className="px-0">
              <Button
                disabled={!file || !!busy}
                onClick={() =>
                  void run("import", async () => {
                    const value = await projectPagesApi.import(
                      projectId,
                      pageId,
                      file!,
                    );
                    setPage(value);
                    setConfig(value.draftConfig);
                    setDrafts({});
                    setActive(
                      value.source?.files.find((f) => !f.binary)?.path || "",
                    );
                    setPreview("");
                    setUpload(false);
                    setNotice(
                      "Web build imported into the draft. Preview and publish when ready.",
                    );
                  })
                }
              >
                {busy === "import" && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Replace draft files
              </Button>
              <Button variant="outline" onClick={() => setUpload(false)}>
                Cancel
              </Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
