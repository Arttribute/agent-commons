"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface Agent {
  agentId: string;
  name: string;
  profileImage?: string;
  persona?: string;
  description?: string;
}

/**
 * We'll do a quick seeded shuffle for consistent positioning.
 */
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const newArray = [...array];
  let m = newArray.length;
  while (m) {
    const i = Math.floor(seededRandom(seed + m) * m);
    m--;
    [newArray[m], newArray[i]] = [newArray[i], newArray[m]];
  }
  return newArray;
}

interface Cell {
  row: number;
  col: number;
}

interface PositionedAgent extends Agent {
  position: {
    top: string;
    left: string;
  };
}

function generateAgentPositions(agents: Agent[]): PositionedAgent[] {
  const numAgents = agents.length;
  if (!numAgents) return [];

  const columns = Math.ceil(Math.sqrt(numAgents));
  const rows = Math.ceil(numAgents / columns);

  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      cells.push({ row, col });
    }
  }

  const shuffledCells = seededShuffle(cells, 42);

  return agents.map((agent, index) => {
    const cell = shuffledCells[index];
    const cellWidthPercent = 100 / columns;
    const cellHeightPercent = 100 / rows;
    const baseLeft = cell.col * cellWidthPercent + cellWidthPercent / 2;
    const baseTop = cell.row * cellHeightPercent + cellHeightPercent / 2;
    const offsetX = (seededRandom(index) - 0.5) * cellWidthPercent * 0.5;
    const offsetY =
      (seededRandom(index + 1000) - 0.5) * cellHeightPercent * 0.5;

    return {
      ...agent,
      position: {
        top: `${baseTop + offsetY}%`,
        left: `${baseLeft + offsetX}%`,
      },
    };
  });
}

export default function AgentsShowcase({ agents = [] }: { agents: Agent[] }) {
  const agentsWithPositions = useMemo(
    () => generateAgentPositions(agents),
    [agents]
  );

  if (!agents.length) {
    return <p>No agents found. Create one!</p>;
  }

  return (
    <div className="overflow-hidden">
      {agentsWithPositions.map((agent, idx) => (
        <div
          key={agent.agentId || idx}
          className="absolute"
          style={{
            top: agent.position.top,
            left: agent.position.left,
            transform: "translate(-50%, -50%)",
          }}
        >
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: (idx % 5) * 0.2,
            }}
          >
            <HoverCard>
              <HoverCardTrigger asChild>
                <Link href={`/studio/agents/${agent.agentId}`}>
                  <button
                    className="w-20 h-20 rounded-full overflow-hidden shadow-md hover:shadow-xl transition p-0.5 border border-gray-500"
                    aria-label={agent.name}
                  >
                    <Image
                      src={
                        agent.profileImage || "https://github.com/shadcn.png" // fallback
                      }
                      alt={agent.name}
                      width={100}
                      height={100}
                      className="object-cover rounded-full w-full h-full"
                    />
                  </button>
                </Link>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 bg-white p-4 rounded-lg shadow-lg z-20">
                <h3 className="mb-2 text-lg font-bold">{agent.name}</h3>

                <p className="text-sm text-gray-700">
                  {agent.persona || agent.description || "No description."}
                </p>
              </HoverCardContent>
            </HoverCard>
          </motion.div>
        </div>
      ))}
    </div>
  );
}
