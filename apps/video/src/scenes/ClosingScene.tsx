import { interpolate, useCurrentFrame } from "remotion";

import { RelayLogo } from "../components/Chrome";
import { enter, rise, springIn } from "../components/animation";
import { COLORS } from "../constants";

const statements = [
  { color: COLORS.mint, from: 5, text: "One brief in." },
  { color: COLORS.blue, from: 35, text: "Better offers out." },
  { color: COLORS.ivory, from: 66, text: "Evidence attached." },
] as const;

export const ClosingScene = () => {
  const frame = useCurrentFrame();
  const brandIn = springIn(frame, 104);
  const ctaIn = enter(frame, 132, 28);

  return (
    <div className="scene closing-scene">
      <div className="closing-scene__statements">
        {statements.map((statement, index) => {
          const progress = enter(frame, statement.from, 22);
          const fade = interpolate(
            frame,
            [statement.from + 38, statement.from + 58],
            [1, index === statements.length - 1 ? 1 : 0.16],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          return (
            <div
              key={statement.text}
              style={{
                color: statement.color,
                opacity: progress * fade,
                transform: rise(progress, 40),
              }}
            >
              {statement.text}
            </div>
          );
        })}
      </div>

      <div
        className="closing-scene__brand"
        style={{
          opacity: brandIn,
          transform: `translate(-50%, -50%) scale(${0.86 + brandIn * 0.14})`,
        }}
      >
        <RelayLogo inverse size={88} />
        <h1>Your best price, without the back-and-forth.</h1>
        <div
          className="closing-scene__cta"
          style={{ opacity: ctaIn, transform: rise(ctaIn, 24) }}
        >
          Start your brief <span>→</span>
        </div>
        <p style={{ opacity: enter(frame, 150, 24) }}>
          Every recommendation backed by evidence.
        </p>
      </div>

      <svg className="closing-scene__path" viewBox="0 0 1920 1080">
        <path
          d="M0 820 C420 820, 520 670, 760 670 S1190 890, 1920 690"
          fill="none"
          pathLength="1"
          stroke={COLORS.blue}
          strokeDasharray="1"
          strokeDashoffset={
            1 -
            interpolate(frame, [86, 190], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
          strokeWidth="3"
        />
        <circle cx="760" cy="670" fill={COLORS.mint} r="8" />
        <circle cx="1420" cy="805" fill={COLORS.blue} r="8" />
      </svg>
    </div>
  );
};
