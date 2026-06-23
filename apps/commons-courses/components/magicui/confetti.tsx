"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentPropsWithoutRef,
} from "react";
import confetti, { type CreateTypes, type Options } from "canvas-confetti";
import { cn } from "@/lib/utils";

export type ConfettiRef = {
  fire: (options?: Options) => void;
};

type ConfettiProps = ComponentPropsWithoutRef<"canvas"> & {
  options?: Options;
};

export const Confetti = forwardRef<ConfettiRef, ConfettiProps>(
  ({ className, options, ...props }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const confettiRef = useRef<CreateTypes | null>(null);

    useEffect(() => {
      if (!canvasRef.current) return;

      confettiRef.current = confetti.create(canvasRef.current, {
        resize: true,
        useWorker: true,
      });

      return () => {
        confettiRef.current?.reset();
        confettiRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      fire: (fireOptions = {}) => {
        void confettiRef.current?.({
          particleCount: 80,
          spread: 70,
          startVelocity: 36,
          gravity: 0.9,
          ticks: 180,
          scalar: 0.9,
          disableForReducedMotion: true,
          ...options,
          ...fireOptions,
        });
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        className={cn(
          "pointer-events-none fixed inset-0 z-[100] h-dvh w-screen",
          className
        )}
        aria-hidden="true"
        {...props}
      />
    );
  }
);

Confetti.displayName = "Confetti";
