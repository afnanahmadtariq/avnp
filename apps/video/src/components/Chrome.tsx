import { interpolate, useCurrentFrame } from "remotion";

import { COLORS, TOTAL_FRAMES } from "../constants";
import { enter, rise } from "./animation";

interface LogoProps {
  inverse?: boolean;
  markOnly?: boolean;
  size?: number;
}

export const RelayLogo = ({
  inverse = false,
  markOnly = false,
  size = 64,
}: LogoProps) => {
  const ink = inverse ? COLORS.ivory : COLORS.ink;

  return (
    <div className="relay-logo" style={{ gap: size * 0.28 }}>
      <svg aria-label="Relay" height={size} viewBox="0 0 64 64" width={size}>
        <rect
          fill={inverse ? COLORS.ivory : COLORS.ink}
          height="64"
          rx="19"
          width="64"
        />
        <path
          d="M20 46V18h13.25C39.74 18 44 21.82 44 27.5S39.74 37 33.25 37H20"
          fill="none"
          stroke={inverse ? COLORS.ink : COLORS.ivory}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5"
        />
        <path
          d="M32 37l11 10"
          fill="none"
          stroke={inverse ? COLORS.ink : COLORS.ivory}
          strokeLinecap="round"
          strokeWidth="5"
        />
        <circle cx="20" cy="18" fill={COLORS.mint} r="3.25" />
        <circle cx="44" cy="47" fill={COLORS.blue} r="3.25" />
      </svg>
      {!markOnly && (
        <span
          style={{
            color: ink,
            fontSize: size * 0.58,
            letterSpacing: `${size * -0.028}px`,
          }}
        >
          Relay
        </span>
      )}
    </div>
  );
};

interface SceneHeaderProps {
  dark?: boolean;
  label: string;
  step: string;
}

export const SceneHeader = ({
  dark = false,
  label,
  step,
}: SceneHeaderProps) => (
  <div className={`scene-header${dark ? " scene-header--dark" : ""}`}>
    <RelayLogo inverse={dark} size={45} />
    <div className="scene-header__meta">
      <span>{step}</span>
      <span className="scene-header__dot" />
      <strong>{label}</strong>
    </div>
  </div>
);

interface StatusPillProps {
  children: React.ReactNode;
  tone?: "blue" | "green" | "neutral" | "amber";
}

export const StatusPill = ({ children, tone = "neutral" }: StatusPillProps) => (
  <span className={`status-pill status-pill--${tone}`}>
    <i />
    {children}
  </span>
);

export const BrowserFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="browser-frame">
    <div className="browser-frame__bar">
      <span />
      <span />
      <span />
      <div className="browser-frame__address">relay.ai/request/RLY-2048</div>
    </div>
    <div className="browser-frame__body">{children}</div>
  </div>
);

const CAPTIONS = [
  {
    from: 12,
    text: "Getting a moving quote is easy. Knowing whether it is complete is not.",
    to: 147,
  },
  {
    from: 150,
    text: "Meet Relay, your AI purchasing agent.",
    to: 291,
  },
  {
    from: 300,
    text: "Tell Relay what you need once. One conversation becomes one confirmed brief.",
    to: 567,
  },
  {
    from: 570,
    text: "Then Relay works the phones. Every business gets the same facts.",
    to: 927,
  },
  {
    from: 930,
    text: "Every offer becomes a like-for-like comparison. Everything has a place.",
    to: 1254,
  },
  {
    from: 1260,
    text: "Pine & Co. drops from $2,210 to $1,840—with seven evidence points attached.",
    to: 1524,
  },
  {
    from: 1530,
    text: "See what changed, why it changed, and where every claim came from.",
    to: 1674,
  },
  {
    from: 1677,
    text: "One brief in. Better offers out. Every recommendation backed by evidence.",
    to: 1799,
  },
] as const;

export const CaptionTrack = () => {
  const frame = useCurrentFrame();
  const caption = CAPTIONS.find(
    (item) => frame >= item.from && frame <= item.to,
  );

  if (!caption) return null;

  const localFrame = frame - caption.from;
  const duration = caption.to - caption.from;
  const opacity = Math.min(
    enter(localFrame, 0, 10),
    interpolate(localFrame, [duration - 10, duration], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div
      className="caption"
      style={{
        opacity,
        transform: `translateX(-50%) ${rise(enter(localFrame, 0, 12), 18)}`,
      }}
    >
      {caption.text}
    </div>
  );
};

export const GlobalProgress = () => {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [0, TOTAL_FRAMES - 1], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="global-progress">
      <div style={{ width: `${width}%` }} />
    </div>
  );
};
