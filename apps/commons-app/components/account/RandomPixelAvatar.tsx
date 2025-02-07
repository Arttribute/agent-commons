"use client";
import React, { useEffect, useRef } from "react";

interface PixelAvatarProps {
  username: string;
  size?: number; // Default avatar size (in pixels)
  pixelSize?: number; // Number of pixels across and down for the avatar grid
}

// Helper to draw a rounded rectangle on Canvas
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  // Ensure the radius isn't too large
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

const PixelAvatar: React.FC<PixelAvatarProps> = ({
  username,
  size = 64, // Increase canvas size to make "pixels" bigger
  pixelSize = 32, // Keep the same number of squares, but bigger overall canvas
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hash the username to create a unique seed
  const hashUsername = (username: string): number => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = (hash << 5) - hash + username.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }
    return hash;
  };

  // Generate a color from a seed
  const generateColor = (seed: number): string => {
    const r = (seed & 0xff0000) >> 16;
    const g = (seed & 0x00ff00) >> 8;
    const b = seed & 0x0000ff;
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Draw the pixel avatar
  const drawAvatar = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hash = Math.abs(hashUsername(username));

    // Calculate the size of each pixel block
    const gridSize = size / pixelSize;

    // Clear the canvas before drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Generate the pixel pattern based on the hash
    for (let x = 0; x < pixelSize; x++) {
      for (let y = 0; y < pixelSize; y++) {
        const seed = (hash >> (x * y)) & 0xffffff; // Create a unique seed for each pixel
        const color = generateColor(seed);

        // Only fill half the grid (plus possible symmetry in the center)
        if (x < pixelSize / 2 || (x === pixelSize / 2 && y % 2 === 0)) {
          ctx.fillStyle = color;

          // Coordinates for this cell
          const xPos = x * gridSize;
          const yPos = y * gridSize;

          // Draw left half pixel
          drawRoundedRect(ctx, xPos, yPos, gridSize, gridSize, gridSize / 4);

          // Mirror it on the right half
          const mirrorXPos = (pixelSize - 1 - x) * gridSize;
          drawRoundedRect(
            ctx,
            mirrorXPos,
            yPos,
            gridSize,
            gridSize,
            gridSize / 4
          );
        }
      }
    }
  };

  // Redraw avatar when username changes
  useEffect(() => {
    drawAvatar();
  }, [username]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{
          imageRendering: "pixelated",

          borderRadius: "50%",
        }}
        className="rounded-full"
      ></canvas>
    </div>
  );
};

export default PixelAvatar;
