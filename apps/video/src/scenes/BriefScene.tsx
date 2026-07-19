import { interpolate, useCurrentFrame } from "remotion";

import { BrowserFrame, SceneHeader, StatusPill } from "../components/Chrome";
import { enter, rise } from "../components/animation";

const fields = [
  { label: "Route", value: "Rock Hill, SC → Charlotte, NC" },
  { label: "Move date", value: "Tuesday, July 28 · 8–11 AM" },
  { label: "Home", value: "2-bedroom apartment" },
  { label: "Access", value: "One flight · elevator at drop-off" },
  { label: "Inventory", value: "26 boxes · sectional · queen bed" },
  { label: "Budget", value: "$2,000 maximum" },
] as const;

export const BriefScene = () => {
  const frame = useCurrentFrame();
  const headlineIn = enter(frame, 8, 30);
  const frameIn = enter(frame, 18, 34);
  const confirmIn = enter(frame, 232, 24);

  return (
    <div className="scene scene--ivory brief-scene">
      <SceneHeader label="Tell Relay once" step="01" />
      <div className="brief-scene__layout">
        <div className="brief-scene__copy">
          <div
            className="scene-eyebrow"
            style={{ opacity: headlineIn, transform: rise(headlineIn, 24) }}
          >
            One source of truth
          </div>
          <h2 style={{ opacity: headlineIn, transform: rise(headlineIn, 44) }}>
            One conversation becomes one confirmed brief.
          </h2>
          <p
            style={{
              opacity: enter(frame, 28, 28),
              transform: rise(enter(frame, 28, 28), 28),
            }}
          >
            Relay structures the details businesses need—before a single call
            begins.
          </p>

          <div
            className="voice-bubble"
            style={{
              opacity: enter(frame, 58, 24),
              transform: rise(enter(frame, 58, 24), 32),
            }}
          >
            <div className="voice-bubble__wave">
              {Array.from({ length: 15 }, (_, index) => (
                <i
                  key={index}
                  style={{
                    height:
                      8 + Math.abs(Math.sin((frame + index * 7) / 9)) * 24,
                  }}
                />
              ))}
            </div>
            <p>
              “Two bedrooms, one flight at pickup, and an elevator at the new
              building…”
            </p>
          </div>
        </div>

        <div
          className="brief-scene__frame"
          style={{
            opacity: frameIn,
            transform: `translateY(${(1 - frameIn) * 54}px) scale(${0.95 + frameIn * 0.05})`,
          }}
        >
          <BrowserFrame>
            <div className="brief-ui">
              <div className="brief-ui__header">
                <div>
                  <span>REQUEST RLY-2048</span>
                  <h3>Charlotte apartment move</h3>
                </div>
                <StatusPill tone="blue">Interviewing</StatusPill>
              </div>
              <div className="brief-ui__progress">
                <div
                  style={{
                    width: `${interpolate(frame, [38, 230], [18, 100], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })}%`,
                  }}
                />
              </div>
              <div className="brief-ui__fields">
                {fields.map((field, index) => {
                  const progress = enter(frame, 72 + index * 22, 22);
                  return (
                    <div
                      className="brief-field"
                      key={field.label}
                      style={{
                        opacity: progress,
                        transform: rise(progress, 20),
                      }}
                    >
                      <span>{field.label}</span>
                      <strong>{field.value}</strong>
                      <b>✓</b>
                    </div>
                  );
                })}
              </div>
              <div
                className="brief-ui__confirm"
                style={{ opacity: confirmIn, transform: rise(confirmIn, 20) }}
              >
                <div>
                  <strong>Ready for review</strong>
                  <span>All required details confirmed</span>
                </div>
                <button type="button">Confirm brief →</button>
              </div>
            </div>
          </BrowserFrame>
        </div>
      </div>
    </div>
  );
};
