import { Easing, interpolate, useCurrentFrame } from "remotion";

import { RelayLogo } from "../components/Chrome";
import { enter, rise } from "../components/animation";
import { TECH_CAPTIONS, TECH_TOTAL_FRAMES } from "./constants";

export const TechTopBar = ({
  label,
  step,
}: {
  label: string;
  step: string;
}) => (
  <div className="tech-topbar">
    <RelayLogo inverse size={42} />
    <div className="tech-topbar__trace">
      <span>TECHNICAL TRACE</span>
      <i />
      <strong>{step}</strong>
      <em>{label}</em>
    </div>
    <div className="tech-topbar__live">
      <i />
      SYSTEM ACTIVE
    </div>
  </div>
);

export const TechCaptionTrack = () => {
  const frame = useCurrentFrame();
  const caption = TECH_CAPTIONS.find(
    (item) => frame >= item.from && frame < item.to,
  );

  if (!caption) return null;

  const localFrame = frame - caption.from;
  const duration = caption.to - caption.from;
  const opacity = Math.min(
    enter(localFrame, 0, 8),
    interpolate(localFrame, [duration - 8, duration], [1, 0], {
      easing: Easing.in(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div
      className="tech-caption"
      style={{
        opacity,
        transform: `translateX(-50%) ${rise(enter(localFrame, 0, 9), 12)}`,
      }}
    >
      {caption.text}
    </div>
  );
};

export const TechProgress = () => {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [0, TECH_TOTAL_FRAMES - 1], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="tech-progress">
      <div style={{ width: `${width}%` }} />
    </div>
  );
};

export const CodeTag = ({ children }: { children: React.ReactNode }) => (
  <span className="tech-code-tag">{children}</span>
);
