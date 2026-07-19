import { interpolate, useCurrentFrame } from "remotion";

import { SceneHeader } from "../components/Chrome";
import { enter, rise, springIn } from "../components/animation";
import { COLORS } from "../constants";

const quoteCards = [
  {
    accent: COLORS.amber,
    amount: "$1,780*",
    company: "QuickMove",
    details: ["Labor · $1,540", "Truck · included", "*Fuel fee not included"],
    left: 160,
    rotate: -7,
    top: 370,
  },
  {
    accent: COLORS.blue,
    amount: "$2,090",
    company: "Carolina Transit",
    details: ["Labor · $1,740", "Fuel · $60", "Deposit · 40%"],
    left: 700,
    rotate: 2,
    top: 330,
  },
  {
    accent: COLORS.green,
    amount: "$2,110",
    company: "Union City",
    details: ["3-person crew", "Stairs · unclear", "Materials · estimate"],
    left: 1260,
    rotate: 6,
    top: 395,
  },
] as const;

export const ProblemScene = () => {
  const frame = useCurrentFrame();
  const titleIn = enter(frame, 6, 34);
  const questionIn = enter(frame, 105, 28);

  return (
    <div className="scene scene--ivory problem-scene">
      <SceneHeader label="The old way" step="00" />
      <div
        className="problem-scene__title"
        style={{ opacity: titleIn, transform: rise(titleIn, 60) }}
      >
        <span>Three quotes.</span>
        <strong>Three different answers.</strong>
      </div>

      <div className="problem-scene__cards">
        {quoteCards.map((quote, index) => {
          const progress = springIn(frame, 38 + index * 10);
          const drift = Math.sin((frame + index * 31) / 18) * 4;
          return (
            <article
              className="loose-quote"
              key={quote.company}
              style={{
                left: quote.left,
                opacity: progress,
                top: quote.top,
                transform: `translateY(${(1 - progress) * 180 + drift}px) rotate(${quote.rotate}deg) scale(${0.88 + progress * 0.12})`,
              }}
            >
              <div className="loose-quote__top">
                <span style={{ background: quote.accent }} />
                <strong>{quote.company}</strong>
              </div>
              <div className="loose-quote__amount">{quote.amount}</div>
              {quote.details.map((detail) => (
                <div className="loose-quote__detail" key={detail}>
                  {detail}
                </div>
              ))}
            </article>
          );
        })}
      </div>

      <div
        className="problem-scene__question"
        style={{
          opacity: questionIn,
          transform: `translateX(-50%) ${rise(questionIn, 28)}`,
        }}
      >
        What are you actually paying for?
      </div>

      <div
        className="problem-scene__wash"
        style={{
          opacity: interpolate(frame, [130, 178], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </div>
  );
};
