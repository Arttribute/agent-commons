"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
// Adjust these imports to match your project’s structure.
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

// ---------------------------------------------------------------------
// 1. Types and Sample Agent Data
// ---------------------------------------------------------------------

interface Agent {
  id: number;
  name: string;
  avatar: string;
  description: string;
}

const agents: Agent[] = [
  {
    id: 1,
    name: "Agent One",
    avatar: "/avatars/agent1.jpg",
    description: "I'm Agent One. I love exploring new challenges!",
  },
  {
    id: 2,
    name: "Agent Two",
    avatar: "/avatars/agent2.jpg",
    description: "Agent Two here—ready to dive into action.",
  },
  {
    id: 3,
    name: "Agent Three",
    avatar: "/avatars/agent3.jpg",
    description: "Agent Three reporting for duty! Let's get started.",
  },
  {
    id: 4,
    name: "Agent Four",
    avatar: "/avatars/agent4.jpg",
    description: "Agent Four, at your service. How can I assist you today?",
  },
  {
    id: 5,
    name: "Agent Five",
    avatar: "/avatars/agent5.jpg",
    description: "Agent Five here. I'm excited to help you out!",
  },
];

// ---------------------------------------------------------------------
// 2. Helper Functions for Deterministic (Seeded) Positioning
// ---------------------------------------------------------------------

// A simple seeded random number generator.
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// A seeded shuffle to get a deterministic permutation of an array.
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

// Generate non‑overlapping positions for each agent by splitting the
// container into a grid and then shuffling the grid cells deterministically.
function generateAgentPositions(agents: Agent[]): PositionedAgent[] {
  const numAgents = agents.length;
  // Use a near‑square grid.
  const columns = Math.ceil(Math.sqrt(numAgents));
  const rows = Math.ceil(numAgents / columns);

  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      cells.push({ row, col });
    }
  }

  // Shuffle the cells with a fixed seed so the positions remain constant.
  const shuffledCells = seededShuffle(cells, 42);

  return agents.map((agent, index) => {
    const cell = shuffledCells[index];
    const cellWidthPercent = 100 / columns;
    const cellHeightPercent = 100 / rows;
    // Center of the cell.
    const baseLeft = cell.col * cellWidthPercent + cellWidthPercent / 2;
    const baseTop = cell.row * cellHeightPercent + cellHeightPercent / 2;
    // Apply a slight deterministic offset for a more organic feel.
    const offsetX = (seededRandom(agent.id) - 0.5) * cellWidthPercent * 0.5;
    const offsetY =
      (seededRandom(agent.id + 1000) - 0.5) * cellHeightPercent * 0.5;

    return {
      ...agent,
      position: {
        top: `${baseTop + offsetY}%`,
        left: `${baseLeft + offsetX}%`,
      },
    };
  });
}

// ---------------------------------------------------------------------
// 3. Main Component
// ---------------------------------------------------------------------

export default function AgentsShowcase() {
  // Compute positions only once.
  const agentsWithPositions = useMemo(() => generateAgentPositions(agents), []);

  return (
    <div className="relative w-full h-screen overflow-auto bg-gray-50">
      <div className="relative h-full">
        {agentsWithPositions.map((agent) => (
          <div
            key={agent.id}
            className="absolute"
            style={{
              top: agent.position.top,
              left: agent.position.left,
              // Center the avatar by shifting back 50% of its width and height.
              transform: "translate(-50%, -50%)",
            }}
          >
            <motion.div
              // Apply a subtle vertical floating animation.
              animate={{ y: [0, -5, 0] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
                // Stagger the animations so they’re not all in sync.
                delay: (agent.id % 5) * 0.2,
              }}
            >
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="w-16 h-16 rounded-full overflow-hidden shadow-md hover:shadow-xl transition"
                    aria-label={agent.name}
                  >
                    <Image
                      src={agent.avatar}
                      alt={agent.name}
                      width={64}
                      height={64}
                      className="object-cover"
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-4">
                  <h3 className="mb-2 text-lg font-bold">{agent.name}</h3>
                  <p className="text-sm text-gray-700">{agent.description}</p>
                </PopoverContent>
              </Popover>
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  );
}
