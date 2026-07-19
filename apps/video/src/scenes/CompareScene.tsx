import { interpolate, useCurrentFrame } from "remotion";

import { BrowserFrame, SceneHeader, StatusPill } from "../components/Chrome";
import { enter, formatCurrency, rise } from "../components/animation";
import { QUOTES } from "../constants";

export const CompareScene = () => {
  const frame = useCurrentFrame();
  const copyIn = enter(frame, 4, 30);
  const tableIn = enter(frame, 22, 36);

  return (
    <div className="scene scene--ivory compare-scene">
      <SceneHeader label="Compare like for like" step="03" />
      <div className="compare-scene__heading">
        <div>
          <div
            className="scene-eyebrow"
            style={{ opacity: copyIn, transform: rise(copyIn, 20) }}
          >
            Every fee has a place
          </div>
          <h2 style={{ opacity: copyIn, transform: rise(copyIn, 42) }}>
            From messy quotes to one clear decision.
          </h2>
        </div>
        <p style={{ opacity: enter(frame, 26, 28) }}>
          Price, completeness, timing, reputation, and evidence—normalized on
          the same confirmed scope.
        </p>
      </div>

      <div
        className="compare-scene__frame"
        style={{
          opacity: tableIn,
          transform: `translateY(${(1 - tableIn) * 50}px) scale(${0.97 + tableIn * 0.03})`,
        }}
      >
        <BrowserFrame>
          <div className="compare-ui">
            <div className="compare-ui__top">
              <div>
                <span>FINAL REPORT · RLY-2048</span>
                <h3>Your comparison is ready.</h3>
              </div>
              <StatusPill tone="green">3 comparable offers</StatusPill>
            </div>
            <div className="compare-table">
              <div className="compare-row compare-row--header">
                <span>Business</span>
                <span>All-in total</span>
                <span>Deposit</span>
                <span>Fees surfaced</span>
                <span>Evidence</span>
              </div>
              {QUOTES.map((quote, index) => {
                const rowIn = enter(frame, 78 + index * 34, 24);
                return (
                  <div
                    className={`compare-row${index === 0 ? " compare-row--best" : ""}`}
                    key={quote.company}
                    style={{ opacity: rowIn, transform: rise(rowIn, 26) }}
                  >
                    <div className="compare-business">
                      <span>{quote.initials}</span>
                      <div>
                        <strong>{quote.company}</strong>
                        {index === 0 && <small>Recommended</small>}
                      </div>
                    </div>
                    <div className="compare-price">
                      {quote.original !== quote.total && (
                        <s>{formatCurrency(quote.original)}</s>
                      )}
                      <strong>{formatCurrency(quote.total)}</strong>
                    </div>
                    <strong>{quote.deposit}</strong>
                    <div>
                      <strong>{quote.fees}</strong>
                      <small>
                        {index === 0 ? "Every known fee confirmed" : "Itemized"}
                      </small>
                    </div>
                    <div className="evidence-count">
                      <span>{quote.evidence}</span>
                      <small>points</small>
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              className="compare-ui__taxonomy"
              style={{ opacity: enter(frame, 216, 26) }}
            >
              {[
                "Labor",
                "Materials",
                "Fuel",
                "Stairs",
                "Deposit",
                "Arrival",
              ].map((label, index) => (
                <span
                  key={label}
                  style={{
                    opacity: enter(frame, 226 + index * 8, 16),
                    transform: `scale(${0.92 + enter(frame, 226 + index * 8, 16) * 0.08})`,
                  }}
                >
                  ✓ {label}
                </span>
              ))}
            </div>
          </div>
        </BrowserFrame>
      </div>

      <div
        className="compare-scene__scan"
        style={{
          left: `${interpolate(frame, [80, 292], [12, 88], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}%`,
          opacity: interpolate(frame, [72, 88, 280, 306], [0, 0.5, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </div>
  );
};
