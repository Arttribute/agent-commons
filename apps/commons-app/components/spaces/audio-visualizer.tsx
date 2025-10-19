"use client";

import { useEffect, useRef, useState } from "react";

interface AudioVisualizerProps {
  /** Audio level from 0-1 */
  audioLevel?: number;
  /** Whether the agent is currently speaking */
  isSpeaking?: boolean;
  /** Whether the agent is listening (someone else is speaking) */
  isListening?: boolean;
  /** Size of the circle in pixels */
  size?: number;
  /** Base color for the visualization */
  baseColor?: string;
  /** Whether this is in minimized mode */
  isMinimized?: boolean;
}

/**
 * Minimal and elegant audio-reactive circle component.
 * - When listening: subtle, slow pulsing that responds to incoming audio
 * - When speaking: more active, vibrant animation that mirrors the agent's voice
 */
export function AudioVisualizer({
  audioLevel = 0,
  isSpeaking = false,
  isListening = false,
  size = 120,
  baseColor = "#8B5CF6", // purple-500
  isMinimized = false,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [smoothedLevel, setSmoothedLevel] = useState(0);

  // Smooth audio level changes for more natural animation
  useEffect(() => {
    const targetLevel = audioLevel;
    const smoothingFactor = isSpeaking ? 0.4 : 0.25; // Faster, more responsive

    const smoothAnimation = () => {
      setSmoothedLevel((prev) => {
        const diff = targetLevel - prev;
        return prev + diff * smoothingFactor;
      });
      animationFrameRef.current = requestAnimationFrame(smoothAnimation);
    };

    animationFrameRef.current = requestAnimationFrame(smoothAnimation);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioLevel, isSpeaking]);

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;

    // Animation loop
    let time = 0;
    const animate = () => {
      time += 0.016; // ~60fps
      ctx.clearRect(0, 0, size, size);

      if (isSpeaking) {
        // Speaking state: VERY active and prominent, highly responsive to audio
        const baseRadius = size * 0.32; // Larger base size
        const audioRadius = smoothedLevel * size * 0.25; // Much more audio-reactive expansion
        const pulseRadius = Math.sin(time * 4) * size * 0.04; // Faster, more prominent pulse
        const totalRadius = baseRadius + audioRadius + pulseRadius;

        // Multiple outer glow rings for vibrant effect
        for (let i = 5; i >= 0; i--) {
          const glowRadius = totalRadius + i * 12;
          const glowAlpha = (0.25 - i * 0.04) * (0.7 + smoothedLevel * 0.3);

          ctx.beginPath();
          ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = `${baseColor}${Math.floor(glowAlpha * 255).toString(16).padStart(2, "0")}`;
          ctx.fill();
        }

        // Main circle with vibrant gradient
        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          totalRadius
        );
        gradient.addColorStop(0, `${baseColor}FF`);
        gradient.addColorStop(0.6, `${baseColor}F5`);
        gradient.addColorStop(1, `${baseColor}DD`);

        ctx.beginPath();
        ctx.arc(centerX, centerY, totalRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Brighter inner highlight
        const highlightGradient = ctx.createRadialGradient(
          centerX - totalRadius * 0.25,
          centerY - totalRadius * 0.25,
          0,
          centerX,
          centerY,
          totalRadius * 0.7
        );
        highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.5)");
        highlightGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
        highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.beginPath();
        ctx.arc(centerX, centerY, totalRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = highlightGradient;
        ctx.fill();

      } else if (isListening) {
        // Listening state: more visible with clear audio vibration response
        const baseRadius = size * 0.28; // Larger base
        const audioRadius = smoothedLevel * size * 0.18; // More prominent audio response
        const breatheRadius = Math.sin(time * 2) * size * 0.025; // Slightly faster breathing
        const totalRadius = baseRadius + audioRadius + breatheRadius;

        // More visible outer glow
        for (let i = 4; i >= 0; i--) {
          const glowRadius = totalRadius + i * 10;
          const glowAlpha = (0.2 - i * 0.04) * (0.5 + smoothedLevel * 0.5);

          ctx.beginPath();
          ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = `${baseColor}${Math.floor(glowAlpha * 255).toString(16).padStart(2, "0")}`;
          ctx.fill();
        }

        // Main circle - more visible
        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          totalRadius
        );
        gradient.addColorStop(0, `${baseColor}E6`); // 90% opacity
        gradient.addColorStop(0.7, `${baseColor}CC`); // 80% opacity
        gradient.addColorStop(1, `${baseColor}B3`); // 70% opacity

        ctx.beginPath();
        ctx.arc(centerX, centerY, totalRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // More visible inner highlight
        const highlightGradient = ctx.createRadialGradient(
          centerX - totalRadius * 0.3,
          centerY - totalRadius * 0.3,
          0,
          centerX,
          centerY,
          totalRadius * 0.6
        );
        highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.35)");
        highlightGradient.addColorStop(0.6, "rgba(255, 255, 255, 0.1)");
        highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.beginPath();
        ctx.arc(centerX, centerY, totalRadius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = highlightGradient;
        ctx.fill();

      } else {
        // Idle state: more visible static circle with gentle pulse
        const baseRadius = size * 0.25;
        const gentlePulse = Math.sin(time * 1) * size * 0.01; // Very gentle pulse
        const totalRadius = baseRadius + gentlePulse;

        // Visible glow
        for (let i = 2; i >= 0; i--) {
          const glowRadius = totalRadius + i * 8;
          const glowAlpha = 0.15 - i * 0.05;

          ctx.beginPath();
          ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = `${baseColor}${Math.floor(glowAlpha * 255).toString(16).padStart(2, "0")}`;
          ctx.fill();
        }

        // Main circle with gradient
        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          totalRadius
        );
        gradient.addColorStop(0, `${baseColor}CC`); // 80% opacity
        gradient.addColorStop(0.7, `${baseColor}B3`); // 70% opacity
        gradient.addColorStop(1, `${baseColor}99`); // 60% opacity

        ctx.beginPath();
        ctx.arc(centerX, centerY, totalRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Subtle highlight
        const highlightGradient = ctx.createRadialGradient(
          centerX - totalRadius * 0.3,
          centerY - totalRadius * 0.3,
          0,
          centerX,
          centerY,
          totalRadius * 0.5
        );
        highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.25)");
        highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.beginPath();
        ctx.arc(centerX, centerY, totalRadius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = highlightGradient;
        ctx.fill();
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [size, baseColor, isSpeaking, isListening, smoothedLevel]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="absolute inset-0 m-auto"
      style={{ width: size, height: size }}
    />
  );
}
