"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { KnowledgeDocument, KnowledgeFolder } from "./types";

type TreeNode = {
  name: string;
  path: string;
  folder?: KnowledgeFolder;
  folders: Map<string, TreeNode>;
  documents: KnowledgeDocument[];
};

type DragItem =
  | { kind: "document"; id: string; label: string }
  | { kind: "folder"; id: string; label: string; path: string };

type EditingItem = {
  kind: "document" | "folder";
  id: string;
  value: string;
};

export function KnowledgeTree({
  folders,
  documents,
  selectedId,
  canWrite,
  onSelect,
  onCreateFolder,
  onRenameDocument,
  onRenameFolder,
  onMoveDocument,
  onMoveFolder,
  onDeleteDocument,
  onDeleteFolder,
}: {
  folders: KnowledgeFolder[];
  documents: KnowledgeDocument[];
  selectedId: string;
  canWrite: boolean;
  onSelect: (documentId: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRenameDocument: (
    document: KnowledgeDocument,
    nextName: string,
  ) => Promise<void>;
  onRenameFolder: (folder: KnowledgeFolder, nextName: string) => Promise<void>;
  onMoveDocument: (
    document: KnowledgeDocument,
    targetFolderPath: string,
  ) => Promise<void>;
  onMoveFolder: (
    folder: KnowledgeFolder,
    targetFolderPath: string,
  ) => Promise<void>;
  onDeleteDocument: (document: KnowledgeDocument) => void;
  onDeleteFolder: (folder: KnowledgeFolder) => void;
}) {
  const tree = useMemo(
    () => buildTree(folders, documents),
    [documents, folders],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingItem>();
  const [dragging, setDragging] = useState<DragItem>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  async function finishEditing() {
    if (!editing?.value.trim()) {
      setEditing(undefined);
      return;
    }
    const current = editing;
    setEditing(undefined);
    if (current.kind === "document") {
      const document = documents.find((item) => item.documentId === current.id);
      if (document) await onRenameDocument(document, current.value.trim());
    } else {
      const folder = folders.find((item) => item.folderId === current.id);
      if (folder) await onRenameFolder(folder, current.value.trim());
    }
  }

  async function handleDrop(event: DragEndEvent) {
    const item = dragging;
    setDragging(undefined);
    if (!item || !event.over) return;
    const targetPath = String(event.over.id).replace(/^folder:/, "");
    if (item.kind === "document") {
      const document = documents.find(
        (candidate) => candidate.documentId === item.id,
      );
      if (document) await onMoveDocument(document, targetPath);
      return;
    }
    const folder = folders.find((candidate) => candidate.folderId === item.id);
    if (folder) await onMoveFolder(folder, targetPath);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) =>
        setDragging(event.active.data.current as DragItem)
      }
      onDragCancel={() => setDragging(undefined)}
      onDragEnd={(event) => void handleDrop(event)}
    >
      <RootDropZone active={Boolean(dragging)}>
        <TreeLevel
          node={tree}
          depth={0}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          editing={editing}
          setEditing={setEditing}
          finishEditing={finishEditing}
          selectedId={selectedId}
          canWrite={canWrite}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
          onDeleteDocument={onDeleteDocument}
          onDeleteFolder={onDeleteFolder}
        />
      </RootDropZone>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="flex max-w-56 items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-medium shadow-floating">
            {dragging.kind === "folder" ? (
              <Folder className="h-3.5 w-3.5 text-stone-500" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-stone-500" />
            )}
            <span className="truncate">{dragging.label}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function TreeLevel({
  node,
  depth,
  collapsed,
  setCollapsed,
  editing,
  setEditing,
  finishEditing,
  selectedId,
  canWrite,
  onSelect,
  onCreateFolder,
  onDeleteDocument,
  onDeleteFolder,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>;
  editing?: EditingItem;
  setEditing: React.Dispatch<React.SetStateAction<EditingItem | undefined>>;
  finishEditing: () => Promise<void>;
  selectedId: string;
  canWrite: boolean;
  onSelect: (documentId: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onDeleteDocument: (document: KnowledgeDocument) => void;
  onDeleteFolder: (folder: KnowledgeFolder) => void;
}) {
  const childFolders = [...node.folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const childDocuments = [...node.documents].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
  return (
    <div className="space-y-0.5">
      {childFolders.map((child) => {
        if (!child.folder) return null;
        const closed = collapsed.has(child.path);
        return (
          <div key={child.folder.folderId}>
            <FolderRow
              folder={child.folder}
              name={child.name}
              depth={depth}
              closed={closed}
              canWrite={canWrite}
              editing={
                editing?.kind === "folder" &&
                editing.id === child.folder.folderId
                  ? editing
                  : undefined
              }
              setEditing={setEditing}
              finishEditing={finishEditing}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  closed ? next.delete(child.path) : next.add(child.path);
                  return next;
                })
              }
              onCreateFolder={() => onCreateFolder(child.path)}
              onDelete={() => onDeleteFolder(child.folder!)}
            />
            {!closed && (
              <TreeLevel
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                editing={editing}
                setEditing={setEditing}
                finishEditing={finishEditing}
                selectedId={selectedId}
                canWrite={canWrite}
                onSelect={onSelect}
                onCreateFolder={onCreateFolder}
                onDeleteDocument={onDeleteDocument}
                onDeleteFolder={onDeleteFolder}
              />
            )}
          </div>
        );
      })}
      {childDocuments.map((document) => (
        <DocumentRow
          key={document.documentId}
          document={document}
          depth={depth}
          selected={document.documentId === selectedId}
          canWrite={canWrite}
          editing={
            editing?.kind === "document" && editing.id === document.documentId
              ? editing
              : undefined
          }
          setEditing={setEditing}
          finishEditing={finishEditing}
          onSelect={() => onSelect(document.documentId)}
          onDelete={() => onDeleteDocument(document)}
        />
      ))}
    </div>
  );
}

function FolderRow({
  folder,
  name,
  depth,
  closed,
  canWrite,
  editing,
  setEditing,
  finishEditing,
  onToggle,
  onCreateFolder,
  onDelete,
}: {
  folder: KnowledgeFolder;
  name: string;
  depth: number;
  closed: boolean;
  canWrite: boolean;
  editing?: EditingItem;
  setEditing: React.Dispatch<React.SetStateAction<EditingItem | undefined>>;
  finishEditing: () => Promise<void>;
  onToggle: () => void;
  onCreateFolder: () => void;
  onDelete: () => void;
}) {
  const drag = useDraggable({
    id: `drag-folder:${folder.folderId}`,
    disabled: !canWrite,
    data: {
      kind: "folder",
      id: folder.folderId,
      label: name,
      path: folder.path,
    },
  });
  const drop = useDroppable({ id: `folder:${folder.path}` });
  return (
    <div
      ref={drop.setNodeRef}
      className={cn(
        "group flex h-8 items-center rounded-md pr-1 text-xs text-stone-600 transition-colors hover:bg-stone-100/80",
        drop.isOver &&
          "bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-200",
      )}
      style={{ paddingLeft: 4 + depth * 13 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="grid h-6 w-5 shrink-0 place-items-center"
        aria-label={closed ? "Expand folder" : "Collapse folder"}
      >
        {closed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>
      <span
        ref={drag.setNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 active:cursor-grabbing"
      >
        <Folder className="h-3.5 w-3.5 shrink-0 fill-stone-100 text-stone-500" />
        {editing ? (
          <InlineName
            value={editing.value}
            onChange={(value) => setEditing({ ...editing, value })}
            onDone={() => void finishEditing()}
            onCancel={() => setEditing(undefined)}
          />
        ) : (
          <span
            className="truncate"
            onDoubleClick={() =>
              canWrite &&
              setEditing({ kind: "folder", id: folder.folderId, value: name })
            }
          >
            {name}
          </span>
        )}
      </span>
      {canWrite && !editing && (
        <RowMenu
          onRename={() =>
            setEditing({ kind: "folder", id: folder.folderId, value: name })
          }
          onCreateFolder={onCreateFolder}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function DocumentRow({
  document,
  depth,
  selected,
  canWrite,
  editing,
  setEditing,
  finishEditing,
  onSelect,
  onDelete,
}: {
  document: KnowledgeDocument;
  depth: number;
  selected: boolean;
  canWrite: boolean;
  editing?: EditingItem;
  setEditing: React.Dispatch<React.SetStateAction<EditingItem | undefined>>;
  finishEditing: () => Promise<void>;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const drag = useDraggable({
    id: `drag-document:${document.documentId}`,
    disabled: !canWrite,
    data: {
      kind: "document",
      id: document.documentId,
      label: document.title,
    },
  });
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.attributes}
      className={cn(
        "group flex h-8 items-center rounded-md pr-1 text-xs transition-colors hover:bg-stone-100/80",
        selected ? "bg-teal-50 font-medium text-teal-950" : "text-stone-600",
      )}
      style={{ paddingLeft: 19 + depth * 13 }}
    >
      <button
        type="button"
        {...drag.listeners}
        className="mr-0.5 grid h-6 w-4 shrink-0 cursor-grab place-items-center text-stone-300 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        aria-label={`Drag ${document.title}`}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() =>
          canWrite &&
          setEditing({
            kind: "document",
            id: document.documentId,
            value: fileName(document.path),
          })
        }
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        {editing ? (
          <InlineName
            value={editing.value}
            onChange={(value) => setEditing({ ...editing, value })}
            onDone={() => void finishEditing()}
            onCancel={() => setEditing(undefined)}
          />
        ) : (
          <span className="truncate">{document.title}</span>
        )}
      </button>
      {canWrite && !editing && (
        <RowMenu
          onRename={() =>
            setEditing({
              kind: "document",
              id: document.documentId,
              value: fileName(document.path),
            })
          }
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function RootDropZone({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const drop = useDroppable({ id: "folder:" });
  return (
    <div
      ref={drop.setNodeRef}
      className={cn(
        "min-h-full rounded-lg pb-4 transition-colors",
        active && "outline outline-1 outline-dashed outline-stone-200",
        drop.isOver && "bg-teal-50/60 outline-teal-200",
      )}
    >
      {children}
    </div>
  );
}

function RowMenu({
  onRename,
  onCreateFolder,
  onDelete,
}: {
  onRename: () => void;
  onCreateFolder?: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 hover:bg-white group-hover:opacity-100 data-[state=open]:opacity-100"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="h-3.5 w-3.5" /> Rename
        </DropdownMenuItem>
        {onCreateFolder && (
          <DropdownMenuItem onClick={onCreateFolder}>
            <FolderPlus className="h-3.5 w-3.5" /> New subfolder
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InlineName({
  value,
  onChange,
  onDone,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone();
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      className="min-w-0 flex-1 rounded border border-teal-300 bg-white px-1.5 py-0.5 text-xs outline-none ring-2 ring-teal-100"
    />
  );
}

function buildTree(folders: KnowledgeFolder[], documents: KnowledgeDocument[]) {
  const root: TreeNode = {
    name: "",
    path: "",
    folders: new Map(),
    documents: [],
  };
  for (const folder of [...folders].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    const parts = folder.path.split("/").filter(Boolean);
    let node = root;
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      if (!node.folders.has(part)) {
        node.folders.set(part, {
          name: part,
          path,
          folders: new Map(),
          documents: [],
        });
      }
      node = node.folders.get(part)!;
    }
    node.folder = folder;
  }
  for (const document of documents) {
    const parts = document.path.split("/");
    parts.pop();
    let node = root;
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      if (!node.folders.has(part)) {
        node.folders.set(part, {
          name: part,
          path,
          folders: new Map(),
          documents: [],
        });
      }
      node = node.folders.get(part)!;
    }
    node.documents.push(document);
  }
  return root;
}

function fileName(path: string) {
  return path.split("/").pop()?.replace(/\.md$/i, "") || "Untitled";
}
