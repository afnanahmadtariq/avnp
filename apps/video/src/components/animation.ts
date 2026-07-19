import { Easing, interpolate, spring } from "remotion";

export const enter = (frame: number, delay = 0, duration = 24): number =>
  interpolate(frame, [delay, delay + duration], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const springIn = (frame: number, delay = 0): number =>
  spring({
    config: { damping: 18, mass: 0.8, stiffness: 130 },
    delay,
    fps: 30,
    frame,
  });

export const formatCurrency = (value: number): string =>
  `$${Math.round(value).toLocaleString("en-US")}`;

export const rise = (progress: number, distance = 48): string =>
  `translateY(${(1 - progress) * distance}px)`;
