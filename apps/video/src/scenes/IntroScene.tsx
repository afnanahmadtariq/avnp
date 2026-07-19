import { interpolate, spring, useCurrentFrame } from "remotion";

import { RelayLogo } from "../components/Chrome";
import { enter, rise } from "../components/animation";
import { COLORS } from "../constants";

export const IntroScene = () => {
  const frame = useCurrentFrame();
  const mark = spring({
    config: { damping: 15, mass: 0.9, stiffness: 120 },
    fps: 30,
    frame,
  });
  const title = enter(frame, 22, 34);
  const subtitle = enter(frame, 42, 26);
  const lineProgress = interpolate(frame, [20, 115], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="scene intro-scene">
      <svg className="intro-scene__network" viewBox="0 0 1920 1080">
        <path
          d="M0 265 C380 265, 380 520, 760 520 S1160 780, 1920 780"
          fill="none"
          opacity="0.32"
          pathLength="1"
          stroke={COLORS.blue}
          strokeDasharray="1"
          strokeDashoffset={1 - lineProgress}
          strokeWidth="3"
        />
        <path
          d="M0 805 C430 805, 460 600, 900 600 S1350 305, 1920 305"
          fill="none"
          opacity="0.2"
          pathLength="1"
          stroke={COLORS.mint}
          strokeDasharray="1"
          strokeDashoffset={1 - lineProgress}
          strokeWidth="3"
        />
      </svg>

      <div
        className="intro-scene__content"
        style={{ transform: `scale(${0.82 + mark * 0.18})` }}
      >
        <div style={{ opacity: mark }}>
          <RelayLogo inverse markOnly size={136} />
        </div>
        <div
          className="intro-scene__eyebrow"
          style={{ opacity: title, transform: rise(title, 28) }}
        >
          Meet Relay
        </div>
        <h1 style={{ opacity: title, transform: rise(title, 46) }}>
          Your AI purchasing agent.
        </h1>
        <p style={{ opacity: subtitle, transform: rise(subtitle, 32) }}>
          One brief in. The market comes back to you.
        </p>
      </div>

      {[0, 1, 2, 3].map((index) => {
        const nodeIn = enter(frame, 58 + index * 8, 18);
        return (
          <span
            className="intro-scene__node"
            key={index}
            style={{
              background: index % 2 === 0 ? COLORS.mint : COLORS.blue,
              left: `${18 + index * 21}%`,
              opacity: nodeIn,
              top: index % 2 === 0 ? "24%" : "78%",
              transform: `scale(${nodeIn})`,
            }}
          />
        );
      })}
    </div>
  );
};
