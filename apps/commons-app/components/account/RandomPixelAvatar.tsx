import React from "react";

/**
 * A list of single or multi-color gradient classes.
 * Make sure these classes are valid in your Tailwind config!
 */

//no gradients past 300
const multiColorGradients = [
  "bg-gradient-to-r from-red-200 via-yellow-200 to-green-200",
  "bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200",
  "bg-gradient-to-r from-indigo-200 via-fuchsia-200 to-orange-200",
  "bg-gradient-to-r from-teal-200 via-green-200 to-lime-200",
  "bg-gradient-to-r from-rose-200 via-pink-200 to-purple-200",
  "bg-gradient-to-r from-cyan-200 via-sky-200 to-blue-200",
  "bg-gradient-to-r from-violet-200 via-purple-200 to-fuchsia-200",
  "bg-gradient-to-r from-emerald-200 via-green-200 to-lime-200",
  "bg-gradient-to-r from-amber-200 via-yellow-200 to-lime-200",
  "bg-gradient-to-r from-red-300 via-yellow-300 to-green-300",
  "bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300",
  "bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-orange-300",
  "bg-gradient-to-r from-teal-300 via-green-300 to-lime-300",
  "bg-gradient-to-r from-rose-300 via-pink-300 to-purple-300",
  "bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300",
  "bg-gradient-to-r from-violet-300 via-purple-300 to-fuchsia-300",
  "bg-gradient-to-r from-emerald-300 via-green-300 to-lime-300",
  "bg-gradient-to-r from-amber-300 via-yellow-300 to-lime-300",
  "bg-gradient-to-l from-red-200 via-yellow-200 to-green-200",
  "bg-gradient-to-l from-blue-200 via-purple-200 to-pink-200",
  "bg-gradient-to-l from-indigo-200 via-fuchsia-200 to-orange-200",
  "bg-gradient-to-l from-teal-200 via-green-200 to-lime-200",
  "bg-gradient-to-l from-rose-200 via-pink-200 to-purple-200",
  "bg-gradient-to-l from-cyan-200 via-sky-200 to-blue-200",
  "bg-gradient-to-l from-violet-200 via-purple-200 to-fuchsia-200",
  "bg-gradient-to-l from-emerald-200 via-green-200 to-lime-200",
  "bg-gradient-to-l from-amber-200 via-yellow-200 to-lime-200",
  "bg-gradient-to-l from-red-300 via-yellow-300 to-green-300",
  "bg-gradient-to-l from-blue-300 via-purple-300 to-pink-300",
  "bg-gradient-to-l from-indigo-300 via-fuchsia-300 to-orange-300",
  "bg-gradient-to-l from-teal-300 via-green-300 to-lime-300",
  "bg-gradient-to-l from-rose-300 via-pink-300 to-purple-300",
  "bg-gradient-to-l from-cyan-300 via-sky-300 to-blue-300",
  "bg-gradient-to-l from-violet-300 via-purple-300 to-fuchsia-300",
  "bg-gradient-to-l from-emerald-300 via-green-300 to-lime-300",
  "bg-gradient-to-l from-amber-300 via-yellow-300 to-lime-300",
  "bg-gradient-to-t from-red-200 via-yellow-200 to-green-200",
  "bg-gradient-to-t from-blue-200 via-purple-200 to-pink-200",
  "bg-gradient-to-t from-indigo-200 via-fuchsia-200 to-orange-200",
  "bg-gradient-to-t from-teal-200 via-green-200 to-lime-200",
  "bg-gradient-to-t from-rose-200 via-pink-200 to-purple-200",
  "bg-gradient-to-t from-cyan-200 via-sky-200 to-blue-200",
  "bg-gradient-to-t from-violet-200 via-purple-200 to-fuchsia-200",
  "bg-gradient-to-t from-emerald-200 via-green-200 to-lime-200",
  "bg-gradient-to-t from-amber-200 via-yellow-200 to-lime-200",
  "bg-gradient-to-t from-red-300 via-yellow-300 to-green-300",
  "bg-gradient-to-t from-blue-300 via-purple-300 to-pink-300",
  "bg-gradient-to-t from-indigo-300 via-fuchsia-300 to-orange-300",
  "bg-gradient-to-t from-teal-300 via-green-300 to-lime-300",
  "bg-gradient-to-t from-rose-300 via-pink-300 to-purple-300",
  "bg-gradient-to-t from-cyan-300 via-sky-300 to-blue-300",
  "bg-gradient-to-t from-violet-300 via-purple-300 to-fuchsia-300",
  "bg-gradient-to-t from-emerald-300 via-green-300 to-lime-300",
  "bg-gradient-to-t from-amber-300 via-yellow-300 to-lime-300",
  "bg-gradient-to-b from-red-200 via-yellow-200 to-green-200",
  "bg-gradient-to-b from-blue-200 via-purple-200 to-pink-200",
  "bg-gradient-to-b from-indigo-200 via-fuchsia-200 to-orange-200",
  "bg-gradient-to-b from-teal-200 via-green-200 to-lime-200",
  "bg-gradient-to-b from-rose-200 via-pink-200 to-purple-200",
  "bg-gradient-to-b from-cyan-200 via-sky-200 to-blue-200",
  "bg-gradient-to-b from-violet-200 via-purple-200 to-fuchsia-200",
  "bg-gradient-to-b from-emerald-200 via-green-200 to-lime-200",
  "bg-gradient-to-b from-amber-200 via-yellow-200 to-lime-200",
  "bg-gradient-to-b from-red-300 via-yellow-300 to-green-300",
  "bg-gradient-to-b from-blue-300 via-purple-300 to-pink-300",
  "bg-gradient-to-b from-indigo-300 via-fuchsia-300 to-orange-300",
  "bg-gradient-to-b from-teal-300 via-green-300 to-lime-300",
  "bg-gradient-to-b from-rose-300 via-pink-300 to-purple-300",
  "bg-gradient-to-b from-cyan-300 via-sky-300 to-blue-300",
  "bg-gradient-to-b from-violet-300 via-purple-300 to-fuchsia-300",
  "bg-gradient-to-b from-emerald-300 via-green-300 to-lime-300",
  "bg-gradient-to-b from-amber-300 via-yellow-300 to-lime-300",
];

/**
 * Simple hashing function to produce a consistent numeric hash for strings.
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Given a username, return a single gradient class name.
 */
function getGradientForUsername(username: string): string {
  const baseHash = hashCode(username || "default");
  const index = baseHash % multiColorGradients.length;
  return multiColorGradients[index];
}

interface RandomPixelAvatarProps {
  username: string;
  size?: number;
}

/**
 * A circular avatar that uses a multi-color gradient as the background.
 * Displays the first two letters of the username in the center.
 */
export default function RandomPixelAvatar({
  username,
  size = 100,
}: RandomPixelAvatarProps) {
  // Generate a single gradient for the entire avatar.
  const gradientClass = getGradientForUsername(username);

  // Get first two letters (or one if the username is short).
  const initials = username.slice(0, 3).toLowerCase();

  return (
    <div
      className={`relative overflow-hidden rounded-full ${gradientClass}`}
      style={{ width: size, height: size }}
    >
      {/* Overlay initials in the center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-black text-xl font-bold drop-shadow-lg">
          {initials}
        </span>
      </div>
    </div>
  );
}
