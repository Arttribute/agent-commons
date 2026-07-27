"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Eye,
  Gamepad2,
  ImagePlus,
  Layers3,
  Loader2,
  Monitor,
  Palette,
  PanelLeftClose,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { ExperiencePlayer } from "@/components/experiences/experience-player";
import { cn } from "@/lib/utils";
import {
  createScene,
  experienceSceneTypes,
  sceneTypeLabel,
} from "@/lib/experience-schema";
import type {
  ExperienceCharacter,
  ExperienceDocument,
  ExperienceProjectDTO,
  ExperienceScene,
  ExperienceSceneType,
} from "@/types/experience";

type StudioTab = "story" | "cast" | "world" | "ai";
type SaveState = "saved" | "saving" | "unsaved" | "error";

export function ExperienceStudio({ experienceId }: { experienceId: string }) {
  const [project, setProject] = useState<ExperienceProjectDTO | null>(null);
  const [draft, setDraft] = useState<ExperienceDocument | null>(null);
  const [tab, setTab] = useState<StudioTab>("story");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState("");
  const [aiBrief, setAiBrief] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [generatingCharacter, setGeneratingCharacter] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const lastSaved = useRef("");
  const versionRef = useRef(1);

  useEffect(() => {
    fetch(`/api/educator/experiences/${experienceId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load experience.");
        return data.experience as ExperienceProjectDTO;
      })
      .then((experience) => {
        setProject(experience);
        setDraft(experience.draft);
        versionRef.current = experience.draftVersion;
        lastSaved.current = JSON.stringify(experience.draft);
        setSelectedSceneId(experience.draft.startSceneId);
        setSelectedCharacterId(experience.draft.characters[0]?.id || "");
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Could not load experience."),
      );
  }, [experienceId]);

  const persist = useCallback(
    async (
      nextDraft: ExperienceDocument,
      showState = true,
      isFreePreview = project?.isFreePreview,
    ) => {
      if (!project) return false;
      if (showState) setSaveState("saving");
      const response = await fetch(`/api/educator/experiences/${experienceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: nextDraft,
          baseVersion: versionRef.current,
          isFreePreview,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveState("error");
        setError(data.error || "Could not save experience.");
        if (response.status === 409 && data.experience) {
          const current = data.experience as ExperienceProjectDTO;
          setProject(current);
          setDraft(current.draft);
          versionRef.current = current.draftVersion;
          lastSaved.current = JSON.stringify(current.draft);
          setSelectedSceneId(current.draft.startSceneId);
        }
        return false;
      }
      const saved = data.experience as ExperienceProjectDTO;
      versionRef.current = saved.draftVersion;
      lastSaved.current = JSON.stringify(nextDraft);
      setProject(saved);
      setSaveState("saved");
      setError("");
      return true;
    },
    [experienceId, project],
  );

  useEffect(() => {
    if (!draft || !project) return;
    const serialized = JSON.stringify(draft);
    if (serialized === lastSaved.current) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => {
      void persist(draft);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [draft, persist, project]);

  const scene = draft?.scenes.find((item) => item.id === selectedSceneId);
  const character = draft?.characters.find(
    (item) => item.id === selectedCharacterId,
  );
  const previewDocument = useMemo(
    () =>
      draft
        ? {
            ...draft,
            startSceneId:
              draft.scenes.some((item) => item.id === selectedSceneId)
                ? selectedSceneId
                : draft.startSceneId,
          }
        : null,
    [draft, selectedSceneId],
  );

  function updateDraft(updater: (current: ExperienceDocument) => ExperienceDocument) {
    setDraft((current) => (current ? updater(current) : current));
  }

  function updateScene(patch: Partial<ExperienceScene>) {
    if (!scene) return;
    updateDraft((current) => ({
      ...current,
      scenes: current.scenes.map((item) =>
        item.id === scene.id ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addScene(type: ExperienceSceneType) {
    if (!draft) return;
    const next = createScene(type, draft.scenes.length + 1);
    updateDraft((current) => ({
      ...current,
      scenes: [...current.scenes, next],
    }));
    setSelectedSceneId(next.id);
    setTab("story");
  }

  function moveScene(direction: -1 | 1) {
    if (!draft || !scene) return;
    const index = draft.scenes.findIndex((item) => item.id === scene.id);
    const target = index + direction;
    if (target < 0 || target >= draft.scenes.length) return;
    const scenes = [...draft.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    updateDraft((current) => ({ ...current, scenes }));
  }

  function removeScene() {
    if (!draft || !scene || draft.scenes.length === 1) return;
    const scenes = draft.scenes.filter((item) => item.id !== scene.id);
    const fallback = scenes[0].id;
    updateDraft((current) => ({
      ...current,
      scenes: scenes.map((item) => ({
        ...item,
        nextSceneId:
          item.nextSceneId === scene.id ? fallback : item.nextSceneId,
        choices: item.choices?.map((choice) => ({
          ...choice,
          nextSceneId:
            choice.nextSceneId === scene.id ? fallback : choice.nextSceneId,
        })),
      })),
      startSceneId:
        current.startSceneId === scene.id ? fallback : current.startSceneId,
    }));
    setSelectedSceneId(fallback);
  }

  function addCharacter() {
    const next: ExperienceCharacter = {
      id: `character-${crypto.randomUUID().slice(0, 8)}`,
      name: "New character",
      role: "Story character",
      description: "",
      accent: "#71E0E7",
    };
    updateDraft((current) => ({
      ...current,
      characters: [...current.characters, next],
    }));
    setSelectedCharacterId(next.id);
  }

  function updateCharacter(patch: Partial<ExperienceCharacter>) {
    if (!character) return;
    updateDraft((current) => ({
      ...current,
      characters: current.characters.map((item) =>
        item.id === character.id ? { ...item, ...patch } : item,
      ),
    }));
  }

  async function upload(
    event: ChangeEvent<HTMLInputElement>,
    target: "scene-media" | "scene-background" | "character",
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(target);
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/educator/uploads", {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    setUploading("");
    event.target.value = "";
    if (!response.ok || !data.url) {
      setError(data.error || "Could not upload image.");
      return;
    }
    if (target === "character") updateCharacter({ imageUrl: data.url });
    if (target === "scene-media") updateScene({ mediaUrl: data.url });
    if (target === "scene-background") updateScene({ backgroundUrl: data.url });
  }

  async function publish() {
    if (!draft || !project) return;
    setPublishing(true);
    const saved = await persist(draft);
    if (!saved) {
      setPublishing(false);
      return;
    }
    const response = await fetch(
      `/api/educator/experiences/${experienceId}/publish`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => ({}));
    setPublishing(false);
    if (!response.ok) {
      setError(data.error || "Could not publish experience.");
      return;
    }
    setProject(data.experience);
    setError("");
  }

  async function askAi() {
    if (!draft || !aiBrief.trim()) return;
    setAiLoading(true);
    setError("");
    const response = await fetch(
      `/api/educator/experiences/${experienceId}/assist`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: aiBrief, document: draft }),
      },
    );
    const data = await response.json().catch(() => ({}));
    setAiLoading(false);
    if (!response.ok || !data.document) {
      setError(data.error || "The copilot could not prepare a draft.");
      return;
    }
    setDraft(data.document);
    setSelectedSceneId(data.document.startSceneId);
    setTab("story");
  }

  async function generateCharacterArtwork() {
    if (!character || !draft) return;
    setGeneratingCharacter(true);
    setError("");
    const response = await fetch(
      `/api/educator/experiences/${experienceId}/assist/character`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: character.name,
          role: character.role,
          description: character.description,
          world: `${draft.theme.name}, ${draft.theme.atmosphere} atmosphere`,
        }),
      },
    );
    const data = await response.json().catch(() => ({}));
    setGeneratingCharacter(false);
    if (!response.ok || !data.url) {
      setError(data.error || "Character artwork could not be generated.");
      return;
    }
    updateCharacter({ imageUrl: data.url });
  }

  async function updatePreviewAccess(value: boolean) {
    if (!draft || !project) return;
    setProject({ ...project, isFreePreview: value });
    await persist(draft, true, value);
  }

  if (error && !project) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-center text-white">
        <div>
          <CircleAlert className="mx-auto h-7 w-7 text-rose-300" />
          <h1 className="mt-4 text-xl font-bold">Studio unavailable</h1>
          <p className="mt-2 text-sm text-white/55">{error}</p>
          <Link
            href="/educator"
            className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950"
          >
            Back to educator console
          </Link>
        </div>
      </main>
    );
  }
  if (!project || !draft || !previewDocument) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-100 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Opening Experience Studio…
      </main>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
        <Link
          href={`/educator/courses/${project.courseSlug}/experiences`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-950"
          aria-label="Back to experiences"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="hidden h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white sm:flex">
          <Gamepad2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={draft.title}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            className="block w-full max-w-lg truncate bg-transparent text-sm font-bold outline-none"
            aria-label="Experience title"
          />
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {saveState === "saving" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : saveState === "error" ? (
              <CircleAlert className="h-3 w-3 text-rose-500" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            {saveState === "saving"
              ? "Saving"
              : saveState === "unsaved"
                ? "Unsaved changes"
                : saveState === "error"
                  ? "Save failed"
                  : `Saved · draft v${project.draftVersion}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:px-4"
        >
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">Preview</span>
        </button>
        <label className="hidden cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 lg:flex">
          <input
            type="checkbox"
            checked={project.isFreePreview}
            onChange={(event) =>
              void updatePreviewAccess(event.target.checked)
            }
            className="h-4 w-4 accent-slate-950"
          />
          Free preview
        </label>
        <button
          type="button"
          onClick={publish}
          disabled={publishing}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 sm:px-4"
        >
          {publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 text-[#B8F56D]" />
          )}
          {project.status === "published" ? "Publish update" : "Publish"}
        </button>
      </header>

      {error ? (
        <div className="z-20 flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-5 py-2 text-xs font-semibold text-rose-700">
          <CircleAlert className="h-4 w-4" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError("")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "z-20 flex min-h-0 shrink-0 border-r border-slate-200 bg-white transition-[width]",
            railOpen ? "w-[340px]" : "w-[68px]",
          )}
        >
          <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-slate-100 py-3">
            <StudioTabButton
              active={tab === "story"}
              icon={Layers3}
              label="Story"
              onClick={() => {
                setTab("story");
                setRailOpen(true);
              }}
            />
            <StudioTabButton
              active={tab === "cast"}
              icon={Users}
              label="Cast"
              onClick={() => {
                setTab("cast");
                setRailOpen(true);
              }}
            />
            <StudioTabButton
              active={tab === "world"}
              icon={Palette}
              label="World"
              onClick={() => {
                setTab("world");
                setRailOpen(true);
              }}
            />
            <StudioTabButton
              active={tab === "ai"}
              icon={Bot}
              label="AI"
              onClick={() => {
                setTab("ai");
                setRailOpen(true);
              }}
            />
            <button
              type="button"
              onClick={() => setRailOpen((value) => !value)}
              className="mt-auto inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              aria-label={railOpen ? "Collapse panel" : "Expand panel"}
            >
              <PanelLeftClose
                className={cn("h-4 w-4", !railOpen && "rotate-180")}
              />
            </button>
          </nav>

          {railOpen ? (
            <div className="min-w-0 flex-1 overflow-y-auto p-4">
              {tab === "story" ? (
                <StoryPanel
                  draft={draft}
                  selectedSceneId={selectedSceneId}
                  onSelect={setSelectedSceneId}
                  onAdd={addScene}
                />
              ) : null}
              {tab === "cast" ? (
                <CastPanel
                  characters={draft.characters}
                  selectedId={selectedCharacterId}
                  onSelect={setSelectedCharacterId}
                  onAdd={addCharacter}
                />
              ) : null}
              {tab === "world" ? (
                <WorldPanel
                  draft={draft}
                  onChange={(patch) =>
                    updateDraft((current) => ({
                      ...current,
                      theme: { ...current.theme, ...patch },
                    }))
                  }
                />
              ) : null}
              {tab === "ai" ? (
                <AiPanel
                  value={aiBrief}
                  loading={aiLoading}
                  onChange={setAiBrief}
                  onSubmit={askAi}
                />
              ) : null}
            </div>
          ) : null}
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-[#E9EDF1]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 text-xs font-bold text-slate-500 backdrop-blur">
            <span className="inline-flex items-center gap-2">
              <Monitor className="h-3.5 w-3.5" />
              Live stage
            </span>
            <span>{scene ? sceneTypeLabel(scene.type) : "Select a scene"}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-7">
            <div className="mx-auto max-w-5xl overflow-hidden rounded-[1.75rem] border border-slate-300 bg-slate-950 shadow-2xl">
              <ExperiencePlayer
                key={selectedSceneId}
                document={previewDocument}
                preview
              />
            </div>
          </div>
        </main>

        <aside className="z-20 hidden w-[330px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5 xl:block">
          {tab === "cast" && character ? (
            <CharacterInspector
              character={character}
              uploading={uploading === "character"}
              generating={generatingCharacter}
              onChange={updateCharacter}
              onUpload={(event) => void upload(event, "character")}
              onGenerate={() => void generateCharacterArtwork()}
            />
          ) : scene ? (
            <SceneInspector
              scene={scene}
              draft={draft}
              uploading={uploading}
              onChange={updateScene}
              onUpload={upload}
              onMove={moveScene}
              onRemove={removeScene}
            />
          ) : (
            <p className="text-sm text-slate-500">Select a scene to edit it.</p>
          )}
        </aside>
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-950 p-0 lg:p-6">
          <div className="mx-auto min-h-full max-w-7xl overflow-hidden bg-slate-950 lg:min-h-0 lg:rounded-[2rem] lg:border lg:border-white/10">
            <ExperiencePlayer
              document={draft}
              preview
              onClose={() => setPreviewOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudioTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Layers3;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-14 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[9px] font-black uppercase tracking-[0.1em]",
        active
          ? "bg-slate-950 text-white"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function StoryPanel({
  draft,
  selectedSceneId,
  onSelect,
  onAdd,
}: {
  draft: ExperienceDocument;
  selectedSceneId: string;
  onSelect: (id: string) => void;
  onAdd: (type: ExperienceSceneType) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Storyboard
          </p>
          <h2 className="mt-1 text-lg font-bold">Scenes</h2>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
            <ChevronDown className="h-3 w-3" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {experienceSceneTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onAdd(type);
                    setMenuOpen(false);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  {sceneTypeLabel(type)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {draft.scenes.map((scene, index) => (
          <button
            key={scene.id}
            type="button"
            onClick={() => onSelect(scene.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border p-3 text-left",
              selectedSceneId === scene.id
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white hover:border-slate-300",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black",
                selectedSceneId === scene.id
                  ? "bg-white/10"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold">{scene.title}</span>
              <span
                className={cn(
                  "mt-1 block text-[10px]",
                  selectedSceneId === scene.id
                    ? "text-white/45"
                    : "text-slate-400",
                )}
              >
                {sceneTypeLabel(scene.type)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CastPanel({
  characters,
  selectedId,
  onSelect,
  onAdd,
}: {
  characters: ExperienceCharacter[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Character library
          </p>
          <h2 className="mt-1 text-lg font-bold">Cast</h2>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {characters.map((character) => (
          <button
            key={character.id}
            type="button"
            onClick={() => onSelect(character.id)}
            className={cn(
              "overflow-hidden rounded-xl border text-left",
              selectedId === character.id
                ? "border-slate-950 ring-2 ring-slate-950/10"
                : "border-slate-200",
            )}
          >
            <div
              className="flex h-28 items-center justify-center bg-slate-100"
              style={{ backgroundColor: `${character.accent}22` }}
            >
              {character.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.imageUrl}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : (
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-[40%] text-2xl font-black text-slate-950"
                  style={{ backgroundColor: character.accent }}
                >
                  {character.name.slice(0, 1)}
                </span>
              )}
            </div>
            <div className="p-2.5">
              <p className="truncate text-xs font-bold">{character.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                {character.role}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function WorldPanel({
  draft,
  onChange,
}: {
  draft: ExperienceDocument;
  onChange: (patch: Partial<ExperienceDocument["theme"]>) => void;
}) {
  const themes: ExperienceDocument["theme"][] = [
    {
      name: "Midnight aurora",
      background: "#091421",
      surface: "#132536",
      accent: "#71E0E7",
      accentSoft: "#DDF8FA",
      text: "#F8FAFC",
      atmosphere: "aurora",
    },
    {
      name: "Dusky dunes",
      background: "#321B28",
      surface: "#57303A",
      accent: "#F49A72",
      accentSoft: "#FFE2D3",
      text: "#FFF8F3",
      atmosphere: "dunes",
    },
    {
      name: "Mosslight forest",
      background: "#10251F",
      surface: "#1C3A31",
      accent: "#B8F56D",
      accentSoft: "#EAFBCF",
      text: "#F7FFF9",
      atmosphere: "forest",
    },
    {
      name: "Learning studio",
      background: "#172033",
      surface: "#263349",
      accent: "#A7B5FF",
      accentSoft: "#E4E8FF",
      text: "#FFFFFF",
      atmosphere: "studio",
    },
  ];
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        Visual system
      </p>
      <h2 className="mt-1 text-lg font-bold">World</h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Theme tokens keep every scene and character treatment harmonized.
      </p>
      <div className="mt-5 space-y-3">
        {themes.map((theme) => (
          <button
            key={theme.name}
            type="button"
            onClick={() => onChange(theme)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border p-3 text-left",
              draft.theme.name === theme.name
                ? "border-slate-950 ring-2 ring-slate-950/10"
                : "border-slate-200 hover:border-slate-300",
            )}
          >
            <span
              className="h-11 w-16 rounded-lg border border-black/10"
              style={{
                background: `linear-gradient(135deg, ${theme.background}, ${theme.accent})`,
              }}
            />
            <span>
              <span className="block text-xs font-bold">{theme.name}</span>
              <span className="mt-1 block text-[10px] capitalize text-slate-400">
                {theme.atmosphere}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AiPanel({
  value,
  loading,
  onChange,
  onSubmit,
}: {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
        <WandSparkles className="h-3 w-3" />
        Agent Commons
      </span>
      <h2 className="mt-3 text-lg font-bold">Build with your copilot</h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Describe the learner, source material, objectives, and setting. The
        copilot proposes a complete structured draft; nothing publishes
        automatically.
      </p>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={10}
        placeholder="For first-year nursing students, turn the lesson on triage into a case investigation in a remote clinic…"
        className="mt-5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 outline-none focus:border-slate-400"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold text-white disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 text-[#B8F56D]" />
        )}
        Propose storyboard
      </button>
      <p className="mt-3 text-[10px] leading-4 text-slate-400">
        The generated document is validated against the engine schema before it
        can enter the studio.
      </p>
    </div>
  );
}

function SceneInspector({
  scene,
  draft,
  uploading,
  onChange,
  onUpload,
  onMove,
  onRemove,
}: {
  scene: ExperienceScene;
  draft: ExperienceDocument;
  uploading: string;
  onChange: (patch: Partial<ExperienceScene>) => void;
  onUpload: (
    event: ChangeEvent<HTMLInputElement>,
    target: "scene-media" | "scene-background" | "character",
  ) => Promise<void>;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Inspector
          </p>
          <h2 className="mt-1 text-lg font-bold">{sceneTypeLabel(scene.type)}</h2>
        </div>
        <div className="flex gap-1">
          <IconButton label="Move up" icon={ArrowUp} onClick={() => onMove(-1)} />
          <IconButton label="Move down" icon={ArrowDown} onClick={() => onMove(1)} />
          <IconButton label="Delete scene" icon={Trash2} onClick={onRemove} danger />
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Scene type">
          <select
            value={scene.type}
            onChange={(event) => {
              const type = event.target.value as ExperienceSceneType;
              const template = createScene(type, 1);
              onChange({
                ...template,
                id: scene.id,
                title: scene.title,
                eyebrow: scene.eyebrow,
                body: scene.body,
                nextSceneId: scene.nextSceneId,
              });
            }}
            className="studio-input"
          >
            {experienceSceneTypes.map((type) => (
              <option key={type} value={type}>
                {sceneTypeLabel(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Eyebrow">
          <input
            value={scene.eyebrow || ""}
            onChange={(event) => onChange({ eyebrow: event.target.value })}
            className="studio-input"
          />
        </Field>
        <Field label="Title">
          <input
            value={scene.title}
            onChange={(event) => onChange({ title: event.target.value })}
            className="studio-input"
          />
        </Field>
        <Field label="Narrative">
          <textarea
            value={scene.body}
            onChange={(event) => onChange({ body: event.target.value })}
            rows={6}
            className="studio-input resize-none leading-5"
          />
        </Field>
        <Field label="Character">
          <select
            value={scene.characterId || ""}
            onChange={(event) =>
              onChange({ characterId: event.target.value || undefined })
            }
            className="studio-input"
          >
            <option value="">No character</option>
            {draft.characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        </Field>
        {scene.type !== "choice" && scene.type !== "completion" ? (
          <Field label="Next scene">
            <select
              value={scene.nextSceneId || ""}
              onChange={(event) =>
                onChange({ nextSceneId: event.target.value || undefined })
              }
              className="studio-input"
            >
              <option value="">End experience</option>
              {draft.scenes
                .filter((item) => item.id !== scene.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}

        {scene.type === "choice" ? (
          <ChoiceEditor scene={scene} draft={draft} onChange={onChange} />
        ) : null}
        {scene.type === "quiz" ? (
          <OptionEditor scene={scene} onChange={onChange} />
        ) : null}
        {scene.type === "hotspot" ? (
          <HotspotEditor scene={scene} onChange={onChange} />
        ) : null}
        {scene.type === "collect" ? (
          <CollectionItemEditor scene={scene} onChange={onChange} />
        ) : null}
        {scene.type === "sort" || scene.type === "match" ? (
          <GroupingEditor scene={scene} onChange={onChange} />
        ) : null}
        {scene.type === "sequence" ? (
          <SequenceEditor scene={scene} onChange={onChange} />
        ) : null}
        {[
          "quiz",
          "hotspot",
          "collect",
          "sort",
          "match",
          "sequence",
        ].includes(scene.type) ? (
          <>
            <Field label="Prompt">
              <input
                value={scene.prompt || ""}
                onChange={(event) => onChange({ prompt: event.target.value })}
                className="studio-input"
              />
            </Field>
            <Field label="Correct feedback">
              <textarea
                value={scene.successFeedback || ""}
                onChange={(event) =>
                  onChange({ successFeedback: event.target.value })
                }
                rows={3}
                className="studio-input resize-none"
              />
            </Field>
            <Field label="Retry feedback">
              <textarea
                value={scene.retryFeedback || ""}
                onChange={(event) =>
                  onChange({ retryFeedback: event.target.value })
                }
                rows={3}
                className="studio-input resize-none"
              />
            </Field>
          </>
        ) : null}
        {scene.type === "hotspot" ||
        scene.type === "collect" ||
        scene.type === "explainer" ? (
          <UploadField
            label="Activity image"
            loading={uploading === "scene-media"}
            value={scene.mediaUrl}
            onUpload={(event) => void onUpload(event, "scene-media")}
            onUrl={(value) => onChange({ mediaUrl: value })}
          />
        ) : null}
        <UploadField
          label="Scene background"
          loading={uploading === "scene-background"}
          value={scene.backgroundUrl}
          onUpload={(event) => void onUpload(event, "scene-background")}
          onUrl={(value) => onChange({ backgroundUrl: value })}
        />
      </div>
    </div>
  );
}

function ChoiceEditor({
  scene,
  draft,
  onChange,
}: {
  scene: ExperienceScene;
  draft: ExperienceDocument;
  onChange: (patch: Partial<ExperienceScene>) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="studio-label">Choices</label>
      {scene.choices?.map((choice, index) => (
        <div key={choice.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <input
              value={choice.label}
              onChange={(event) =>
                onChange({
                  choices: scene.choices?.map((item) =>
                    item.id === choice.id
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                })
              }
              className="studio-input"
              aria-label={`Choice ${index + 1}`}
            />
            <button
              type="button"
              disabled={(scene.choices?.length || 0) <= 2}
              onClick={() =>
                onChange({
                  choices: scene.choices?.filter(
                    (item) => item.id !== choice.id,
                  ),
                })
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 disabled:opacity-25"
              aria-label={`Remove choice ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <input
            value={choice.description || ""}
            onChange={(event) =>
              onChange({
                choices: scene.choices?.map((item) =>
                  item.id === choice.id
                    ? { ...item, description: event.target.value }
                    : item,
                ),
              })
            }
            placeholder="Optional consequence or context"
            className="studio-input mt-2"
          />
          <select
            value={choice.nextSceneId || ""}
            onChange={(event) =>
              onChange({
                choices: scene.choices?.map((item) =>
                  item.id === choice.id
                    ? { ...item, nextSceneId: event.target.value || undefined }
                    : item,
                ),
              })
            }
            className="studio-input mt-2"
          >
            <option value="">End experience</option>
            {draft.scenes
              .filter((item) => item.id !== scene.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </div>
      ))}
      <button
        type="button"
        disabled={(scene.choices?.length || 0) >= 8}
        onClick={() =>
          onChange({
            choices: [
              ...(scene.choices || []),
              {
                id: crypto.randomUUID(),
                label: "New choice",
              },
            ],
          })
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        Add choice
      </button>
    </div>
  );
}

function OptionEditor({
  scene,
  onChange,
}: {
  scene: ExperienceScene;
  onChange: (patch: Partial<ExperienceScene>) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="studio-label">Answers</label>
      {scene.options?.map((option, index) => (
        <div key={option.id} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onChange({
                options: scene.options?.map((item) => ({
                  ...item,
                  correct: item.id === option.id,
                })),
              })
            }
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
              option.correct
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-300",
            )}
            aria-label="Mark as correct"
          >
            <Check className="h-4 w-4" />
          </button>
          <input
            value={option.label}
            onChange={(event) =>
              onChange({
                options: scene.options?.map((item) =>
                  item.id === option.id
                    ? { ...item, label: event.target.value }
                    : item,
                ),
              })
            }
            className="studio-input"
          />
          <button
            type="button"
            disabled={(scene.options?.length || 0) <= 2}
            onClick={() =>
              onChange({
                options: scene.options?.filter(
                  (item) => item.id !== option.id,
                ),
              })
            }
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-20"
            aria-label={`Remove answer ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={(scene.options?.length || 0) >= 10}
        onClick={() =>
          onChange({
            options: [
              ...(scene.options || []),
              {
                id: crypto.randomUUID(),
                label: "New answer",
              },
            ],
          })
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        Add answer
      </button>
    </div>
  );
}

function HotspotEditor({
  scene,
  onChange,
}: {
  scene: ExperienceScene;
  onChange: (patch: Partial<ExperienceScene>) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="studio-label">Hotspot targets</label>
      {scene.hotspots?.map((hotspot, index) => (
        <div key={hotspot.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onChange({
                  hotspots: scene.hotspots?.map((item) => ({
                    ...item,
                    correct: item.id === hotspot.id,
                  })),
                })
              }
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                hotspot.correct
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-300",
              )}
              aria-label="Mark as correct hotspot"
            >
              <Check className="h-4 w-4" />
            </button>
            <input
              value={hotspot.label}
              onChange={(event) =>
                onChange({
                  hotspots: scene.hotspots?.map((item) =>
                    item.id === hotspot.id
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                })
              }
              className="studio-input"
              aria-label={`Hotspot ${index + 1}`}
            />
            <button
              type="button"
              disabled={(scene.hotspots?.length || 0) <= 1}
              onClick={() =>
                onChange({
                  hotspots: scene.hotspots?.filter(
                    (item) => item.id !== hotspot.id,
                  ),
                })
              }
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:text-rose-600 disabled:opacity-20"
              aria-label={`Remove hotspot ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["x", "X", 0, 100],
                ["y", "Y", 0, 100],
                ["radius", "Size", 2, 30],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                  {label}
                </span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={hotspot[key]}
                  onChange={(event) =>
                    onChange({
                      hotspots: scene.hotspots?.map((item) =>
                        item.id === hotspot.id
                          ? {
                              ...item,
                              [key]: Math.max(
                                min,
                                Math.min(max, Number(event.target.value)),
                              ),
                            }
                          : item,
                      ),
                    })
                  }
                  className="studio-input"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={(scene.hotspots?.length || 0) >= 12}
        onClick={() =>
          onChange({
            hotspots: [
              ...(scene.hotspots || []),
              {
                id: crypto.randomUUID(),
                label: "New target",
                x: 50,
                y: 50,
                radius: 10,
                correct: !(scene.hotspots || []).some(
                  (hotspot) => hotspot.correct,
                ),
              },
            ],
          })
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        Add target
      </button>
    </div>
  );
}

function CollectionItemEditor({
  scene,
  onChange,
}: {
  scene: ExperienceScene;
  onChange: (patch: Partial<ExperienceScene>) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="studio-label">Collectable items</label>
      {scene.items?.map((item, index) => (
        <div key={item.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <input
              value={item.label}
              onChange={(event) =>
                onChange({
                  items: scene.items?.map((candidate) =>
                    candidate.id === item.id
                      ? { ...candidate, label: event.target.value }
                      : candidate,
                  ),
                })
              }
              className="studio-input"
              aria-label={`Collectable item ${index + 1}`}
            />
            <button
              type="button"
              disabled={(scene.items?.length || 0) <= 1}
              onClick={() =>
                onChange({
                  items: scene.items?.filter(
                    (candidate) => candidate.id !== item.id,
                  ),
                })
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-300 hover:text-rose-600 disabled:opacity-20"
              aria-label={`Remove collectable item ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <input
            value={item.description || ""}
            onChange={(event) =>
              onChange({
                items: scene.items?.map((candidate) =>
                  candidate.id === item.id
                    ? { ...candidate, description: event.target.value }
                    : candidate,
                ),
              })
            }
            placeholder="What the learner discovers"
            className="studio-input mt-2"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["x", "y"] as const).map((key) => (
              <label key={key}>
                <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                  {key} position
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={item[key] ?? 50}
                  onChange={(event) =>
                    onChange({
                      items: scene.items?.map((candidate) =>
                        candidate.id === item.id
                          ? {
                              ...candidate,
                              [key]: Math.max(
                                0,
                                Math.min(100, Number(event.target.value)),
                              ),
                            }
                          : candidate,
                      ),
                    })
                  }
                  className="studio-input"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={(scene.items?.length || 0) >= 20}
        onClick={() =>
          onChange({
            items: [
              ...(scene.items || []),
              {
                id: crypto.randomUUID(),
                label: "New evidence",
                description: "",
                x: 50,
                y: 50,
              },
            ],
          })
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        Add collectable
      </button>
    </div>
  );
}

function GroupingEditor({
  scene,
  onChange,
}: {
  scene: ExperienceScene;
  onChange: (patch: Partial<ExperienceScene>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="studio-label">
          {scene.type === "match" ? "Match destinations" : "Categories"}
        </label>
        {scene.zones?.map((zone, index) => (
          <div key={zone.id} className="flex items-center gap-2">
            <input
              value={zone.label}
              onChange={(event) =>
                onChange({
                  zones: scene.zones?.map((candidate) =>
                    candidate.id === zone.id
                      ? { ...candidate, label: event.target.value }
                      : candidate,
                  ),
                })
              }
              className="studio-input"
              aria-label={`Destination ${index + 1}`}
            />
            <button
              type="button"
              disabled={(scene.zones?.length || 0) <= 2}
              onClick={() =>
                onChange({
                  zones: scene.zones?.filter(
                    (candidate) => candidate.id !== zone.id,
                  ),
                  items: scene.items?.map((item) =>
                    item.targetId === zone.id
                      ? { ...item, targetId: undefined }
                      : item,
                  ),
                })
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-300 hover:text-rose-600 disabled:opacity-20"
              aria-label={`Remove destination ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={(scene.zones?.length || 0) >= 10}
          onClick={() =>
            onChange({
              zones: [
                ...(scene.zones || []),
                {
                  id: crypto.randomUUID(),
                  label:
                    scene.type === "match"
                      ? "New match"
                      : "New category",
                },
              ],
            })
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-900"
        >
          <Plus className="h-3.5 w-3.5" />
          Add destination
        </button>
      </div>

      <div className="space-y-2">
        <label className="studio-label">Draggable cards</label>
        {scene.items?.map((item, index) => (
          <div key={item.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <input
                value={item.label}
                onChange={(event) =>
                  onChange({
                    items: scene.items?.map((candidate) =>
                      candidate.id === item.id
                        ? { ...candidate, label: event.target.value }
                        : candidate,
                    ),
                  })
                }
                className="studio-input"
                aria-label={`Draggable card ${index + 1}`}
              />
              <button
                type="button"
                disabled={(scene.items?.length || 0) <= 2}
                onClick={() =>
                  onChange({
                    items: scene.items?.filter(
                      (candidate) => candidate.id !== item.id,
                    ),
                  })
                }
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-300 hover:text-rose-600 disabled:opacity-20"
                aria-label={`Remove card ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <select
              value={item.targetId || ""}
              onChange={(event) =>
                onChange({
                  items: scene.items?.map((candidate) =>
                    candidate.id === item.id
                      ? {
                          ...candidate,
                          targetId: event.target.value || undefined,
                        }
                      : candidate,
                  ),
                })
              }
              className="studio-input mt-2"
            >
              <option value="">Choose correct destination</option>
              {scene.zones?.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          disabled={(scene.items?.length || 0) >= 20}
          onClick={() =>
            onChange({
              items: [
                ...(scene.items || []),
                {
                  id: crypto.randomUUID(),
                  label: "New card",
                  targetId: scene.zones?.[0]?.id,
                },
              ],
            })
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-900"
        >
          <Plus className="h-3.5 w-3.5" />
          Add card
        </button>
      </div>
    </div>
  );
}

function SequenceEditor({
  scene,
  onChange,
}: {
  scene: ExperienceScene;
  onChange: (patch: Partial<ExperienceScene>) => void;
}) {
  function move(index: number, direction: -1 | 1) {
    const items = [...(scene.items || [])];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    onChange({ items });
  }

  return (
    <div className="space-y-2">
      <label className="studio-label">Correct sequence</label>
      {scene.items?.map((item, index) => (
        <div key={item.id} className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-500">
            {index + 1}
          </span>
          <input
            value={item.label}
            onChange={(event) =>
              onChange({
                items: scene.items?.map((candidate) =>
                  candidate.id === item.id
                    ? { ...candidate, label: event.target.value }
                    : candidate,
                ),
              })
            }
            className="studio-input"
            aria-label={`Sequence step ${index + 1}`}
          />
          <IconButton
            label="Move step up"
            icon={ArrowUp}
            onClick={() => move(index, -1)}
          />
          <IconButton
            label="Move step down"
            icon={ArrowDown}
            onClick={() => move(index, 1)}
          />
          <button
            type="button"
            disabled={(scene.items?.length || 0) <= 2}
            onClick={() =>
              onChange({
                items: scene.items?.filter(
                  (candidate) => candidate.id !== item.id,
                ),
              })
            }
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:text-rose-600 disabled:opacity-20"
            aria-label={`Remove sequence step ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={(scene.items?.length || 0) >= 20}
        onClick={() =>
          onChange({
            items: [
              ...(scene.items || []),
              {
                id: crypto.randomUUID(),
                label: "New step",
              },
            ],
          })
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-900"
      >
        <Plus className="h-3.5 w-3.5" />
        Add step
      </button>
    </div>
  );
}

function CharacterInspector({
  character,
  uploading,
  generating,
  onChange,
  onUpload,
  onGenerate,
}: {
  character: ExperienceCharacter;
  uploading: boolean;
  generating: boolean;
  onChange: (patch: Partial<ExperienceCharacter>) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onGenerate: () => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        Character inspector
      </p>
      <h2 className="mt-1 text-lg font-bold">{character.name}</h2>
      <div className="mt-5 space-y-4">
        <Field label="Name">
          <input
            value={character.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className="studio-input"
          />
        </Field>
        <Field label="Story role">
          <input
            value={character.role}
            onChange={(event) => onChange({ role: event.target.value })}
            className="studio-input"
          />
        </Field>
        <Field label="Character bible">
          <textarea
            value={character.description || ""}
            onChange={(event) => onChange({ description: event.target.value })}
            rows={5}
            className="studio-input resize-none"
          />
        </Field>
        <Field label="Accent">
          <input
            type="color"
            value={character.accent}
            onChange={(event) => onChange({ accent: event.target.value })}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white p-1"
          />
        </Field>
        <UploadField
          label="Character artwork"
          loading={uploading}
          value={character.imageUrl}
          onUpload={onUpload}
          onUrl={(value) => onChange({ imageUrl: value })}
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || uploading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-50 px-4 py-3 text-xs font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <WandSparkles className="h-4 w-4" />
          )}
          {generating ? "Generating artwork…" : "Generate with Agent Commons"}
        </button>
        <p className="text-[10px] leading-4 text-slate-400">
          Uses the character bible and world style. The generated original
          remains in your Commons library; a durable copy is saved to course
          media.
        </p>
      </div>
    </div>
  );
}

function UploadField({
  label,
  loading,
  value,
  onUpload,
  onUrl,
}: {
  label: string;
  loading: boolean;
  value?: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUrl: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input
          value={value || ""}
          onChange={(event) => onUrl(event.target.value)}
          placeholder="Paste URL or upload"
          className="studio-input min-w-0"
        />
        <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={onUpload}
            disabled={loading}
          />
        </label>
      </div>
    </Field>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="studio-label">{label}</span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  danger,
}: {
  label: string;
  icon: typeof ArrowUp;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-900",
        danger && "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
