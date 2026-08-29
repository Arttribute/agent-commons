"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import type { KnowledgeGraph } from "./types";

type GraphNode = KnowledgeGraph["nodes"][number] & {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type Transform = { x: number; y: number; scale: number };

export function KnowledgeGraphView({
  graph,
  selectedId,
  onSelect,
  onOpen,
}: {
  graph: KnowledgeGraph;
  selectedId?: string;
  onSelect: (documentId: string) => void;
  onOpen?: (documentId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const sizeRef = useRef({ width: 0, height: 0, ratio: 1 });
  const animationRef = useRef<number | undefined>(undefined);
  const selectedRef = useRef(selectedId);
  const hoverRef = useRef<string | undefined>(undefined);
  const interactionRef = useRef<
    | {
        mode: "node" | "pan";
        node?: GraphNode;
        startX: number;
        startY: number;
        lastX: number;
        lastY: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const [ready, setReady] = useState(false);

  const resolvedEdges = useMemo(
    () => graph.edges.filter((edge) => edge.resolved && edge.target),
    [graph.edges],
  );
  const neighborMap = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const edge of resolvedEdges) {
      if (!edge.target) continue;
      if (!result.has(edge.source)) result.set(edge.source, new Set());
      if (!result.has(edge.target)) result.set(edge.target, new Set());
      result.get(edge.source)!.add(edge.target);
      result.get(edge.target)!.add(edge.source);
    }
    return result;
  }, [resolvedEdges]);
  const neighborRef = useRef(neighborMap);
  const edgeRef = useRef(resolvedEdges);

  useEffect(() => {
    neighborRef.current = neighborMap;
    edgeRef.current = resolvedEdges;
  }, [neighborMap, resolvedEdges]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { width, height, ratio } = sizeRef.current;
    const transform = transformRef.current;
    const nodes = nodesRef.current;
    const selected = selectedRef.current;
    const hovered = hoverRef.current;
    const neighbors = selected
      ? neighborRef.current.get(selected) || new Set<string>()
      : undefined;
    const byId = new Map(nodes.map((node) => [node.id, node]));

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const glow = context.createRadialGradient(
      width * 0.5,
      height * 0.46,
      0,
      width * 0.5,
      height * 0.46,
      Math.max(width, height) * 0.72,
    );
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(1, "#f5f4f1");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(transform.x, transform.y);
    context.scale(transform.scale, transform.scale);
    for (const edge of edgeRef.current) {
      const source = byId.get(edge.source);
      const target = edge.target ? byId.get(edge.target) : undefined;
      if (!source || !target) continue;
      const connected =
        !selected || edge.source === selected || edge.target === selected;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.strokeStyle = connected
        ? selected
          ? "rgba(139, 92, 246, .72)"
          : "rgba(100, 116, 139, .3)"
        : "rgba(120, 113, 108, .09)";
      context.lineWidth =
        (connected && selected ? 1.15 : 0.8) / transform.scale;
      context.stroke();
    }

    const labelScale = Math.max(0.76, Math.min(1.1, transform.scale));
    for (const node of nodes) {
      const active = node.id === selected;
      const hovering = node.id === hovered;
      const related = !selected || active || neighbors?.has(node.id);
      const radius =
        (active
          ? 6.3
          : hovering
            ? 5.2
            : 3.2 + Math.min(2, node.degree * 0.16)) /
        Math.sqrt(transform.scale);
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      if (active) {
        context.shadowBlur = 15 / transform.scale;
        context.shadowColor = "rgba(139, 92, 246, .42)";
        context.fillStyle = "#8b5cf6";
      } else if (related) {
        context.shadowBlur = hovering ? 10 / transform.scale : 0;
        context.shadowColor = "rgba(28, 25, 23, .2)";
        context.fillStyle = hovering ? "#292524" : "#78716c";
      } else {
        context.shadowBlur = 0;
        context.fillStyle = "rgba(120, 113, 108, .22)";
      }
      context.fill();
      context.shadowBlur = 0;
      const alpha = related ? (active || hovering ? 1 : 0.86) : 0.2;
      context.fillStyle = `rgba(41, 37, 36, ${alpha})`;
      context.font = `${active ? 600 : 400} ${11 / labelScale}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(
        truncateLabel(node.title, transform.scale),
        node.x,
        node.y + radius + 4 / transform.scale,
      );
    }
    context.restore();
  }, []);

  const fitGraph = useCallback(
    (animate = false) => {
      const nodes = nodesRef.current;
      const { width, height } = sizeRef.current;
      if (!nodes.length || !width || !height) return;
      const minX = Math.min(...nodes.map((node) => node.x));
      const maxX = Math.max(...nodes.map((node) => node.x));
      const minY = Math.min(...nodes.map((node) => node.y));
      const maxY = Math.max(...nodes.map((node) => node.y));
      const graphWidth = Math.max(180, maxX - minX);
      const graphHeight = Math.max(150, maxY - minY);
      const scale = Math.max(
        0.18,
        Math.min(
          1.45,
          Math.min((width - 120) / graphWidth, (height - 100) / graphHeight),
        ),
      );
      const target = {
        scale,
        x: width / 2 - ((minX + maxX) / 2) * scale,
        y: height / 2 - ((minY + maxY) / 2) * scale,
      };
      if (!animate) {
        transformRef.current = target;
        draw();
        return;
      }
      const start = { ...transformRef.current };
      const began = performance.now();
      const tick = (time: number) => {
        const progress = Math.min(1, (time - began) / 220);
        const eased = 1 - Math.pow(1 - progress, 3);
        transformRef.current = {
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
          scale: start.scale + (target.scale - start.scale) * eased,
        };
        draw();
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [draw],
  );

  useEffect(() => {
    selectedRef.current = selectedId;
    draw();
  }, [draw, selectedId]);

  useEffect(() => {
    setReady(false);
    nodesRef.current = graph.nodes.map((node, index) => {
      const angle = seededAngle(node.id, index);
      const radius = 42 + Math.sqrt(index + 1) * 31;
      return {
        ...node,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.72,
        vx: 0,
        vy: 0,
      };
    });
    let frame = 0;
    const simulate = () => {
      const nodes = nodesRef.current;
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const repulsion = nodes.length > 260 ? 1150 : 1750;
      for (let left = 0; left < nodes.length; left += 1) {
        const a = nodes[left];
        for (let right = left + 1; right < nodes.length; right += 1) {
          const b = nodes[right];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const distanceSquared = Math.max(90, dx * dx + dy * dy);
          const distance = Math.sqrt(distanceSquared);
          dx /= distance;
          dy /= distance;
          const force = Math.min(1.8, repulsion / distanceSquared);
          a.vx -= dx * force;
          a.vy -= dy * force;
          b.vx += dx * force;
          b.vy += dy * force;
        }
      }
      for (const edge of resolvedEdges) {
        const source = byId.get(edge.source);
        const target = edge.target ? byId.get(edge.target) : undefined;
        if (!source || !target) continue;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const desired = 76 + Math.min(38, (source.degree + target.degree) * 2);
        const force = (distance - desired) * 0.0075;
        source.vx += (dx / distance) * force;
        source.vy += (dy / distance) * force;
        target.vx -= (dx / distance) * force;
        target.vy -= (dy / distance) * force;
      }
      for (const node of nodes) {
        node.vx += -node.x * 0.0008;
        node.vy += -node.y * 0.0008;
        node.vx *= 0.86;
        node.vy *= 0.86;
        node.x += node.vx;
        node.y += node.vy;
      }
      frame += 1;
      if (frame === 12 || frame === 70) fitGraph(false);
      draw();
      if (frame < 145) animationRef.current = requestAnimationFrame(simulate);
      else setReady(true);
    };
    animationRef.current = requestAnimationFrame(simulate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [draw, fitGraph, graph.nodes, resolvedEdges]);

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;
    const resize = () => {
      const rect = surface.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { width: rect.width, height: rect.height, ratio };
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      if (!transformRef.current.x && !transformRef.current.y) fitGraph(false);
      else draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();
    return () => observer.disconnect();
  }, [draw, fitGraph]);

  function screenPoint(event: React.PointerEvent | React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function hitNode(point: { x: number; y: number }) {
    const transform = transformRef.current;
    const x = (point.x - transform.x) / transform.scale;
    const y = (point.y - transform.y) / transform.scale;
    let best: GraphNode | undefined;
    let distance = 15 / transform.scale;
    for (const node of nodesRef.current) {
      const next = Math.hypot(node.x - x, node.y - y);
      if (next < distance) {
        best = node;
        distance = next;
      }
    }
    return best;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = screenPoint(event);
    const node = hitNode(point);
    interactionRef.current = {
      mode: node ? "node" : "pan",
      node,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = screenPoint(event);
    const interaction = interactionRef.current;
    if (!interaction) {
      const hovered = hitNode(point)?.id;
      if (hoverRef.current !== hovered) {
        hoverRef.current = hovered;
        event.currentTarget.style.cursor = hovered ? "pointer" : "grab";
        draw();
      }
      return;
    }
    const dx = point.x - interaction.lastX;
    const dy = point.y - interaction.lastY;
    interaction.lastX = point.x;
    interaction.lastY = point.y;
    if (
      Math.hypot(point.x - interaction.startX, point.y - interaction.startY) > 3
    ) {
      interaction.moved = true;
    }
    if (interaction.mode === "node" && interaction.node) {
      interaction.node.x += dx / transformRef.current.scale;
      interaction.node.y += dy / transformRef.current.scale;
      interaction.node.vx = 0;
      interaction.node.vy = 0;
      event.currentTarget.style.cursor = "grabbing";
    } else {
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      event.currentTarget.style.cursor = "grabbing";
    }
    draw();
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const interaction = interactionRef.current;
    interactionRef.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.style.cursor = "grab";
    if (interaction?.node && !interaction.moved) onSelect(interaction.node.id);
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const node = hitNode(screenPoint(event));
    if (node) (onOpen || onSelect)(node.id);
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const point = screenPoint(event);
    const previous = transformRef.current;
    const nextScale = clamp(
      previous.scale * Math.exp(-event.deltaY * 0.0014),
      0.16,
      3.2,
    );
    const worldX = (point.x - previous.x) / previous.scale;
    const worldY = (point.y - previous.y) / previous.scale;
    transformRef.current = {
      scale: nextScale,
      x: point.x - worldX * nextScale,
      y: point.y - worldY * nextScale,
    };
    draw();
  }

  function zoom(multiplier: number) {
    const { width, height } = sizeRef.current;
    const point = { x: width / 2, y: height / 2 };
    const previous = transformRef.current;
    const nextScale = clamp(previous.scale * multiplier, 0.16, 3.2);
    const worldX = (point.x - previous.x) / previous.scale;
    const worldY = (point.y - previous.y) / previous.scale;
    transformRef.current = {
      scale: nextScale,
      x: point.x - worldX * nextScale,
      y: point.y - worldY * nextScale,
    };
    draw();
  }

  return (
    <div
      ref={surfaceRef}
      className="relative h-full min-h-[480px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[inset_0_1px_rgba(255,255,255,.75),0_8px_30px_rgba(28,25,23,.07)]"
    >
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="Interactive knowledge graph. Drag to pan, scroll to zoom, click to focus, and double-click a note to open it."
        className="block h-full w-full cursor-grab touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          interactionRef.current = undefined;
        }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-stone-200/80 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-sm">
        <p className="text-[11px] font-medium text-stone-800">
          Knowledge graph
        </p>
        <p className="mt-0.5 text-[10px] text-stone-500">
          {graph.nodes.length} notes · {resolvedEdges.length} connections
        </p>
      </div>
      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-stone-200 bg-white/90 shadow-md backdrop-blur">
        <GraphControl label="Zoom in" icon={Plus} onClick={() => zoom(1.25)} />
        <GraphControl label="Zoom out" icon={Minus} onClick={() => zoom(0.8)} />
        <GraphControl
          label="Fit graph"
          icon={Focus}
          onClick={() => fitGraph(true)}
        />
        <GraphControl
          label="Clear focus"
          icon={RotateCcw}
          onClick={() => onSelect("")}
        />
      </div>
      {!graph.nodes.length && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-stone-400">
          Connected notes will gather here.
        </div>
      )}
      {!ready && graph.nodes.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-4 text-[10px] text-stone-400">
          Arranging connections…
        </div>
      )}
    </div>
  );
}

function GraphControl({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Plus;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center border-b border-stone-200 text-stone-500 last:border-b-0 hover:bg-stone-100 hover:text-stone-900"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function seededAngle(value: string, index: number) {
  let hash = 2166136261;
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    hash ^= value.charCodeAt(cursor);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2 + index * 0.43;
}

function truncateLabel(value: string, scale: number) {
  const limit = scale < 0.42 ? 22 : scale < 0.7 ? 30 : 44;
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
