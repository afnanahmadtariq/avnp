import { interpolate, useCurrentFrame } from "remotion";

import { SceneHeader, StatusPill } from "../components/Chrome";
import { enter, formatCurrency, rise, springIn } from "../components/animation";
import { COLORS, QUOTES } from "../constants";

const cardPositions = [
  { left: 180, top: 302 },
  { left: 1255, top: 260 },
  { left: 1255, top: 620 },
] as const;

export const CallsScene = () => {
  const frame = useCurrentFrame();
  const heading = enter(frame, 5, 30);
  const routeProgress = interpolate(frame, [44, 126], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="scene calls-scene">
      <SceneHeader dark label="Relay works the phones" step="02" />
      <div
        className="calls-scene__heading"
        style={{ opacity: heading, transform: rise(heading, 36) }}
      >
        <span>Same facts in.</span>
        <strong>Comparable offers out.</strong>
      </div>

      <svg className="calls-scene__routes" viewBox="0 0 1920 1080">
        <path
          d="M825 510 C650 510, 650 435, 485 435"
          pathLength="1"
          stroke={COLORS.mint}
          strokeDasharray="1"
          strokeDashoffset={1 - routeProgress}
        />
        <path
          d="M1095 485 C1220 485, 1220 400, 1360 400"
          pathLength="1"
          stroke={COLORS.blue}
          strokeDasharray="1"
          strokeDashoffset={1 - routeProgress}
        />
        <path
          d="M1095 565 C1220 565, 1220 725, 1360 725"
          pathLength="1"
          stroke={COLORS.blue}
          strokeDasharray="1"
          strokeDashoffset={1 - routeProgress}
        />
      </svg>

      <div
        className="calls-scene__brief"
        style={{
          opacity: springIn(frame, 22),
          transform: `translate(-50%, -50%) scale(${0.82 + springIn(frame, 22) * 0.18})`,
        }}
      >
        <StatusPill tone="green">Confirmed brief</StatusPill>
        <h3>Charlotte apartment move</h3>
        <div className="calls-scene__brief-line">
          <span>Route</span>
          <strong>Rock Hill → Charlotte</strong>
        </div>
        <div className="calls-scene__brief-line">
          <span>Scope</span>
          <strong>2 bedrooms · 26 boxes</strong>
        </div>
        <div className="calls-scene__brief-line">
          <span>Budget</span>
          <strong>$2,000 max</strong>
        </div>
        <div className="calls-scene__lock">⌁ Scope locked for every call</div>
      </div>

      {QUOTES.map((quote, index) => {
        const progress = springIn(frame, 76 + index * 18);
        const offerProgress = interpolate(
          frame,
          [168 + index * 18, 250 + index * 14],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const currentOffer = interpolate(
          offerProgress,
          [0, 1],
          [quote.original, quote.total],
        );

        return (
          <article
            className="call-card"
            key={quote.company}
            style={{
              left: cardPositions[index]?.left,
              opacity: progress,
              top: cardPositions[index]?.top,
              transform: `scale(${0.88 + progress * 0.12})`,
            }}
          >
            <div className="call-card__top">
              <span>{quote.initials}</span>
              <div>
                <strong>{quote.company}</strong>
                <StatusPill tone={index === 0 ? "green" : "blue"}>
                  {index === 0 ? "Offer improved" : "Calling"}
                </StatusPill>
              </div>
            </div>
            <div className="call-card__wave">
              {Array.from({ length: 24 }, (_, barIndex) => (
                <i
                  key={barIndex}
                  style={{
                    height:
                      5 +
                      Math.abs(
                        Math.sin(
                          (frame * (0.8 + index * 0.12) + barIndex * 8) / 9,
                        ),
                      ) *
                        24,
                  }}
                />
              ))}
            </div>
            <div className="call-card__offer">
              <span>Current offer</span>
              <strong>{formatCurrency(currentOffer)}</strong>
            </div>
            <p>
              {index === 0
                ? "Fuel surcharge removed"
                : index === 1
                  ? "Deposit terms under review"
                  : "Itemized quote received"}
            </p>
          </article>
        );
      })}

      <div
        className="calls-scene__truth"
        style={{
          opacity: enter(frame, 280, 26),
          transform: `translateX(-50%) ${rise(enter(frame, 280, 26), 26)}`,
        }}
      >
        <span>✓</span>
        No invented leverage. No silent scope changes.
      </div>
    </div>
  );
};
