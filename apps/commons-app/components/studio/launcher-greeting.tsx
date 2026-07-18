"use client";

import { useEffect, useState } from "react";

const DEFAULTS = [
  "What can I do for you?",
  "Where should we begin?",
  "Where should we start?",
  "What are we building today?",
];

const MORNING = [
  "Good morning — what shall we make?",
  "Morning! Where should we begin?",
  "Fresh day, fresh session. What first?",
];

const AFTERNOON = [
  "Good afternoon — what's next?",
  "What can I take off your plate?",
  "Afternoon! What are we building?",
];

const EVENING = [
  "Good evening — what shall we wrap up?",
  "Evening session? Let's make it count.",
  "Winding down or just warming up?",
];

const WEEKEND = [
  "Weekend build? Love it.",
  "No meetings. Just agents.",
];

/**
 * Picks a lighthearted, contextual line for the launcher: time of day and
 * weekday feed a small pool, deterministic per day so it doesn't flicker
 * between visits. Defaults always stay in the mix.
 */
function pickGreeting(now: Date) {
  const hour = now.getHours();
  const day = now.getDay();
  const pool = [...DEFAULTS];
  if (hour < 12) pool.push(...MORNING);
  else if (hour < 18) pool.push(...AFTERNOON);
  else pool.push(...EVENING);
  if (day === 0 || day === 6) pool.push(...WEEKEND);
  // Deterministic within the same day-part so re-renders keep the same line.
  const seed =
    now.getFullYear() * 1000 +
    now.getMonth() * 50 +
    now.getDate() * 3 +
    Math.floor(hour / 6);
  return pool[seed % pool.length];
}

export function LauncherGreeting() {
  // Render the stable default on the server pass, then swap in the
  // contextual line after mount to avoid hydration mismatches.
  const [greeting, setGreeting] = useState(DEFAULTS[0]);
  useEffect(() => {
    setGreeting(pickGreeting(new Date()));
  }, []);

  return (
    <h2 className="font-space text-2xl tracking-tight text-foreground sm:text-3xl">
      {greeting}
    </h2>
  );
}
