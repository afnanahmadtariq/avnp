import { interpolate, useCurrentFrame } from "remotion";

import { SceneHeader, StatusPill } from "../components/Chrome";
import { enter, formatCurrency, rise, springIn } from "../components/animation";

const evidence = [
  {
    detail: "Confirmed verbally and in the revised quote",
    label: "$1,840 guaranteed total",
    source: "Transcript · 12:42",
  },
  {
    detail: "Both fees marked included",
    label: "No fuel or stair surcharge",
    source: "Revised quote · lines 6–8",
  },
  {
    detail: "Dispatcher confirmed a one-hour window",
    label: "8:00–9:00 AM arrival",
    source: "Transcript · 12:39",
  },
] as const;

export const RecommendationScene = () => {
  const frame = useCurrentFrame();
  const heroIn = springIn(frame, 10);
  const priceProgress = interpolate(frame, [46, 116], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const price = interpolate(priceProgress, [0, 1], [2210, 1840]);
  const savings = interpolate(priceProgress, [0, 1], [0, 370]);

  return (
    <div className="scene recommendation-scene">
      <SceneHeader dark label="Choose with proof" step="04" />
      <div className="recommendation-scene__layout">
        <div
          className="recommendation-card"
          style={{
            opacity: heroIn,
            transform: `translateY(${(1 - heroIn) * 60}px) scale(${0.92 + heroIn * 0.08})`,
          }}
        >
          <div className="recommendation-card__header">
            <div className="recommendation-card__identity">
              <span>P&</span>
              <div>
                <small>RELAY RECOMMENDS</small>
                <h3>Pine & Co. Moving</h3>
              </div>
            </div>
            <StatusPill tone="green">94% confidence</StatusPill>
          </div>
          <div className="recommendation-card__price">
            <div>
              <span>Verified total</span>
              <strong>{formatCurrency(price)}</strong>
            </div>
            <div className="recommendation-card__savings">
              <span>Verified savings</span>
              <strong>+{formatCurrency(savings)}</strong>
            </div>
          </div>
          <div className="recommendation-card__before">
            Initial offer <s>$2,210</s>
            <span>→</span>
            fuel surcharge removed + labor improved
          </div>
          <div className="recommendation-card__terms">
            <div>
              <span>Arrival</span>
              <strong>8:00–9:00 AM</strong>
            </div>
            <div>
              <span>Deposit</span>
              <strong>20%</strong>
            </div>
            <div>
              <span>Known fees</span>
              <strong>$0 outstanding</strong>
            </div>
          </div>
          <div
            className="recommendation-card__verified"
            style={{
              opacity: enter(frame, 106, 24),
              transform: rise(enter(frame, 106, 24), 18),
            }}
          >
            <span>✓</span>
            <div>
              <strong>Best verified value</strong>
              <p>$80 below the next offer · every fee confirmed</p>
            </div>
          </div>
        </div>

        <div className="evidence-panel">
          <div
            className="scene-eyebrow scene-eyebrow--light"
            style={{ opacity: enter(frame, 62, 24) }}
          >
            Evidence attached
          </div>
          <h2
            style={{
              opacity: enter(frame, 68, 28),
              transform: rise(enter(frame, 68, 28), 32),
            }}
          >
            The “why” is never hidden.
          </h2>
          <div className="evidence-panel__list">
            {evidence.map((item, index) => {
              const itemIn = enter(frame, 108 + index * 28, 22);
              return (
                <article
                  key={item.label}
                  style={{ opacity: itemIn, transform: rise(itemIn, 24) }}
                >
                  <span>0{index + 1}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                    <small>{item.source}</small>
                  </div>
                  <b>↗</b>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
