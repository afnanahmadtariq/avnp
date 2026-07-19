import { Easing, interpolate, spring, useCurrentFrame } from "remotion";

import { RelayLogo } from "../components/Chrome";
import { enter, rise } from "../components/animation";
import { COLORS } from "../constants";
import { CodeTag, TechTopBar } from "./TechChrome";
import { PROVIDERS, TECH_STACK } from "./constants";

const fastSpring = (frame: number, delay = 0) =>
  spring({
    config: { damping: 17, mass: 0.65, stiffness: 170 },
    delay,
    fps: 30,
    frame,
  });

const Wave = ({ frame, seed = 0 }: { frame: number; seed?: number }) => (
  <div className="tech-wave">
    {Array.from({ length: 22 }, (_, index) => (
      <i
        key={index}
        style={{
          height:
            7 +
            Math.abs(Math.sin((frame * 1.6 + index * 7 + seed * 13) / 8)) * 28,
        }}
      />
    ))}
  </div>
);

export const TechIntroScene = () => {
  const frame = useCurrentFrame();
  const titleIn = enter(frame, 4, 20);
  const packetIn = fastSpring(frame, 16);
  const route = interpolate(frame, [34, 96], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="tech-scene tech-intro">
      <div className="tech-intro__copy">
        <div
          className="tech-kicker"
          style={{ opacity: titleIn, transform: rise(titleIn, 18) }}
        >
          RELAY · SYSTEM OVERVIEW
        </div>
        <h1 style={{ opacity: titleIn, transform: rise(titleIn, 42) }}>
          One confirmed brief.
          <span>A verifiable market.</span>
        </h1>
        <p style={{ opacity: enter(frame, 22, 18) }}>
          From customer intent to evidence-backed decision—in one durable trace.
        </p>
      </div>

      <div className="tech-intro__system">
        <svg viewBox="0 0 860 680">
          {[170, 340, 510].map((y, index) => (
            <path
              d={`M410 340 C560 340, 560 ${y}, 735 ${y}`}
              fill="none"
              key={y}
              pathLength="1"
              stroke={index === 0 ? COLORS.mint : COLORS.blue}
              strokeDasharray="1"
              strokeDashoffset={1 - route}
              strokeWidth="3"
            />
          ))}
        </svg>
        <div
          className="tech-brief-packet"
          style={{
            opacity: packetIn,
            transform: `translate(-50%, -50%) scale(${0.78 + packetIn * 0.22})`,
          }}
        >
          <div className="tech-brief-packet__top">
            <span>CONFIRMED BRIEF</span>
            <strong>v7</strong>
          </div>
          <h3>RLY-2048</h3>
          <p>Same facts for every call</p>
          <CodeTag>sha256: 8f7…2a1</CodeTag>
        </div>
        {["$1,840", "$1,920", "$2,110"].map((price, index) => {
          const cardIn = fastSpring(frame, 68 + index * 10);
          return (
            <div
              className={`tech-offer tech-offer--${index + 1}`}
              key={price}
              style={{
                opacity: cardIn,
                transform: `scale(${0.84 + cardIn * 0.16})`,
              }}
            >
              <span>OFFER {index + 1}</span>
              <strong>{price}</strong>
              <small>evidence attached</small>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ArchitectureScene = () => {
  const frame = useCurrentFrame();
  const path = interpolate(frame, [22, 112], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const transactionIn = enter(frame, 154, 22);

  return (
    <div className="tech-scene tech-architecture">
      <TechTopBar label="RUNTIME BOUNDARIES" step="01" />
      <div className="tech-heading tech-heading--compact">
        <div>
          <span>FAST REQUESTS · DURABLE WORK</span>
          <h2>One trace across five boundaries.</h2>
        </div>
        <CodeTag>typed contracts end-to-end</CodeTag>
      </div>

      <div className="tech-architecture__map">
        <svg viewBox="0 0 1640 340">
          <path
            d="M130 170 H1510"
            fill="none"
            pathLength="1"
            stroke={COLORS.blue}
            strokeDasharray="1"
            strokeDashoffset={1 - path}
            strokeWidth="4"
          />
        </svg>
        <div
          className="tech-moving-packet"
          style={{
            left: `${interpolate(path, [0, 1], [7.5, 92.5])}%`,
            opacity: interpolate(path, [0, 0.05, 0.96, 1], [0, 1, 1, 0]),
          }}
        >
          <i /> BRIEF v7
        </div>
        <div className="tech-architecture__nodes">
          {TECH_STACK.map((node, index) => {
            const nodeIn = fastSpring(frame, 10 + index * 18);
            return (
              <article
                className={`tech-stack-node tech-stack-node--${node.tone}`}
                key={node.label}
                style={{
                  opacity: nodeIn,
                  transform: `translateY(${(1 - nodeIn) * 28}px) scale(${0.9 + nodeIn * 0.1})`,
                }}
              >
                <div>
                  <span>0{index + 1}</span>
                  <i />
                </div>
                <h3>{node.label}</h3>
                <p>{node.detail}</p>
              </article>
            );
          })}
        </div>
      </div>

      <div
        className="tech-transaction"
        style={{ opacity: transactionIn, transform: rise(transactionIn, 24) }}
      >
        <div className="tech-transaction__label">
          <span>POSTGRES TRANSACTION</span>
          <strong>COMMITTED</strong>
        </div>
        {["job_spec_version", "negotiation_run", "outbox_event"].map(
          (item, index) => (
            <div
              className="tech-transaction__row"
              key={item}
              style={{ opacity: enter(frame, 168 + index * 10, 14) }}
            >
              <i>✓</i>
              <code>{item}</code>
              <span>
                {index === 0 ? "immutable" : index === 1 ? "created" : "ready"}
              </span>
            </div>
          ),
        )}
        <CodeTag>atomic · versioned · recoverable</CodeTag>
      </div>
    </div>
  );
};

export const QueueScene = () => {
  const frame = useCurrentFrame();
  const queueIn = enter(frame, 6, 18);
  const dispatch = interpolate(frame, [38, 146], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="tech-scene tech-queue">
      <TechTopBar label="DURABLE ORCHESTRATION" step="02" />
      <div className="tech-heading">
        <div>
          <span>REDIS + BULLMQ</span>
          <h2>Identifiers move. Secrets stay put.</h2>
        </div>
        <div className="tech-heading__chips">
          <CodeTag>idempotent</CodeTag>
          <CodeTag>retry-safe</CodeTag>
          <CodeTag>concurrency: 3</CodeTag>
        </div>
      </div>

      <div
        className="tech-queue__lane"
        style={{ opacity: queueIn, transform: rise(queueIn, 20) }}
      >
        <div className="tech-queue__source">
          <strong>OUTBOX</strong>
          <span>event ready</span>
        </div>
        <div className="tech-queue__rail">
          <i />
          {["discover", "place-call", "normalize", "rank"].map(
            (name, index) => {
              const position = Math.max(
                0,
                Math.min(1, dispatch * 1.36 - index * 0.12),
              );
              return (
                <div
                  className="tech-job-card"
                  key={name}
                  style={{
                    left: `${position * 86 + 2}%`,
                    opacity: enter(frame, 20 + index * 12, 12),
                  }}
                >
                  <span>{name}</span>
                  <code>run_id</code>
                </div>
              );
            },
          )}
        </div>
        <div className="tech-worker-core">
          <RelayLogo inverse markOnly size={54} />
          <div>
            <strong>WORKER</strong>
            <span>long-running process</span>
          </div>
        </div>
      </div>

      <div className="tech-queue__calls">
        {["Pine & Co.", "Carolina Transit", "Union City"].map(
          (business, index) => {
            const cardIn = fastSpring(frame, 112 + index * 12);
            return (
              <article
                key={business}
                style={{
                  opacity: cardIn,
                  transform: `translateY(${(1 - cardIn) * 28}px)`,
                }}
              >
                <div className="tech-call-card__top">
                  <span>CALL 0{index + 1}</span>
                  <strong>LIVE</strong>
                </div>
                <h3>{business}</h3>
                <Wave frame={frame} seed={index} />
                <code>key: run-2048:call:{index + 1}</code>
              </article>
            );
          },
        )}
      </div>
    </div>
  );
};

export const ProvidersScene = () => {
  const frame = useCurrentFrame();
  const route = interpolate(frame, [25, 106], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="tech-scene tech-providers">
      <TechTopBar label="PROVIDER ADAPTERS" step="03" />
      <div className="tech-heading tech-heading--providers">
        <div>
          <span>NARROW CAPABILITIES</span>
          <h2>Replaceable infrastructure. Stable contracts.</h2>
        </div>
        <CodeTag>fixture ↔ live</CodeTag>
      </div>

      <div className="tech-provider-map">
        <svg viewBox="0 0 1640 650">
          {[
            "M820 325 C650 325, 630 145, 390 145",
            "M820 325 C990 325, 1010 145, 1250 145",
            "M820 325 C650 325, 630 515, 390 515",
            "M820 325 C990 325, 1010 515, 1250 515",
          ].map((d, index) => (
            <path
              d={d}
              fill="none"
              key={d}
              pathLength="1"
              stroke={index % 2 === 0 ? COLORS.mint : COLORS.blue}
              strokeDasharray="1"
              strokeDashoffset={1 - Math.max(0, route - index * 0.06)}
              strokeWidth="3"
            />
          ))}
        </svg>
        <div
          className="tech-provider-core"
          style={{
            opacity: fastSpring(frame, 4),
            transform: `translate(-50%, -50%) scale(${0.84 + fastSpring(frame, 4) * 0.16})`,
          }}
        >
          <RelayLogo inverse markOnly size={80} />
          <strong>ADAPTER LAYER</strong>
          <CodeTag>server-only</CodeTag>
        </div>
        {PROVIDERS.map((provider, index) => {
          const providerIn = fastSpring(frame, 62 + index * 14);
          return (
            <article
              className={`tech-provider-node tech-provider-node--${provider.position}`}
              key={provider.label}
              style={{
                opacity: providerIn,
                transform: `scale(${0.86 + providerIn * 0.14})`,
              }}
            >
              <div>{provider.short}</div>
              <span>CAPABILITY 0{index + 1}</span>
              <h3>{provider.label}</h3>
              <p>{provider.detail}</p>
              {index === 1 && <Wave frame={frame} seed={5} />}
              {index !== 1 && (
                <code>
                  {
                    [
                      "discoverBusinesses()",
                      "",
                      "extractQuote()",
                      "storeEvidence()",
                    ][index]
                  }
                </code>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};

const policySteps = [
  { label: "Normalize fees", result: "same taxonomy" },
  { label: "Verify evidence", result: "source required" },
  { label: "Check leverage", result: "truthful + current" },
  { label: "Rank offers", result: "deterministic" },
] as const;

export const PolicyScene = () => {
  const frame = useCurrentFrame();

  return (
    <div className="tech-scene tech-policy">
      <TechTopBar label="DOMAIN POLICY" step="04" />
      <div className="tech-heading">
        <div>
          <span>PROVIDER-INDEPENDENT RULES</span>
          <h2>The model extracts. Policy decides.</h2>
        </div>
        <CodeTag>pure functions · explicit inputs</CodeTag>
      </div>

      <div className="tech-policy__pipeline">
        <article className="tech-raw-quote">
          <div className="tech-raw-quote__top">
            <span>STRUCTURED OUTCOME</span>
            <strong>$1,840</strong>
          </div>
          <pre>{`{\n  labor: 1620,\n  fuel: 0,\n  deposit: 20%,\n  evidence: 7\n}`}</pre>
          <div className="tech-raw-quote__source">↳ transcript 08:42–08:57</div>
        </article>

        <div className="tech-policy__steps">
          {policySteps.map((step, index) => {
            const stepIn = fastSpring(frame, 28 + index * 22);
            return (
              <div
                key={step.label}
                style={{
                  opacity: stepIn,
                  transform: `translateX(${(1 - stepIn) * 30}px)`,
                }}
              >
                <i>✓</i>
                <span>
                  <strong>{step.label}</strong>
                  <small>{step.result}</small>
                </span>
              </div>
            );
          })}
          <div
            className="tech-policy__rejected"
            style={{ opacity: enter(frame, 128, 18) }}
          >
            <i>×</i>
            stale quote rejected
          </div>
        </div>

        <article
          className="tech-ranked-offer"
          style={{
            opacity: fastSpring(frame, 132),
            transform: `translateY(${(1 - fastSpring(frame, 132)) * 28}px)`,
          }}
        >
          <span>RECOMMENDATION 01</span>
          <h3>Pine & Co. Moving</h3>
          <div className="tech-ranked-offer__price">
            <s>$2,210</s>
            <strong>$1,840</strong>
          </div>
          <div className="tech-ranked-offer__score">
            <i style={{ width: "92%" }} />
          </div>
          <div className="tech-ranked-offer__meta">
            <span>92 score</span>
            <span>7 sources</span>
            <span>fees complete</span>
          </div>
          <p>Every factor links back to its evidence.</p>
        </article>
      </div>
    </div>
  );
};

export const EventsScene = () => {
  const frame = useCurrentFrame();
  const route = interpolate(frame, [18, 124], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const events = [
    { label: "call.completed", time: "00:41", tone: "mint" },
    { label: "quote.improved", time: "00:46", tone: "blue" },
    { label: "report.ready", time: "00:52", tone: "mint" },
  ] as const;

  return (
    <div className="tech-scene tech-events">
      <TechTopBar label="LIVE PROGRESS" step="05" />
      <div className="tech-events__copy">
        <span>WORKER → API → EXPERIENCE</span>
        <h2>The customer sees the trace—not the machinery.</h2>
        <p>
          Ordered events update calls, quote movement, evidence, and final
          reasoning.
        </p>
        <div className="tech-events__protocols">
          <CodeTag>SSE / polling</CodeTag>
          <CodeTag>ownership checked</CodeTag>
          <CodeTag>monotonic state</CodeTag>
        </div>
      </div>

      <div className="tech-events__route">
        <svg viewBox="0 0 870 530">
          <path
            d="M80 420 C220 420, 205 115, 430 115 S650 420, 790 420"
            fill="none"
            pathLength="1"
            stroke={COLORS.blue}
            strokeDasharray="1"
            strokeDashoffset={1 - route}
            strokeWidth="4"
          />
        </svg>
        {["WORKER", "API", "WEB"].map((node, index) => (
          <div
            className={`tech-event-node tech-event-node--${index + 1}`}
            key={node}
            style={{ opacity: fastSpring(frame, 8 + index * 24) }}
          >
            <i />
            <strong>{node}</strong>
          </div>
        ))}
        <div className="tech-event-window">
          <div className="tech-event-window__top">
            <span>RUN RLY-2048</span>
            <strong>LIVE</strong>
          </div>
          {events.map((event, index) => {
            const eventIn = fastSpring(frame, 80 + index * 22);
            return (
              <div
                className="tech-event-row"
                key={event.label}
                style={{ opacity: eventIn, transform: rise(eventIn, 16) }}
              >
                <i
                  className={`tech-event-row__dot tech-event-row__dot--${event.tone}`}
                />
                <strong>{event.label}</strong>
                <span>{event.time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const TechClosingScene = () => {
  const frame = useCurrentFrame();
  const logoIn = fastSpring(frame, 52);
  const principles = [
    { color: COLORS.mint, label: "IMMUTABLE" },
    { color: COLORS.blue, label: "DURABLE" },
    { color: COLORS.mint, label: "TRUTHFUL" },
    { color: COLORS.ivory, label: "VERIFIABLE" },
  ] as const;

  return (
    <div className="tech-scene tech-closing">
      <div className="tech-closing__principles">
        {principles.map((principle, index) => {
          const principleIn = enter(frame, index * 12, 16);
          return (
            <span
              key={principle.label}
              style={{
                borderColor: principle.color,
                color: principle.color,
                opacity: principleIn,
                transform: rise(principleIn, 20),
              }}
            >
              {principle.label}
            </span>
          );
        })}
      </div>
      <div
        className="tech-closing__brand"
        style={{
          opacity: logoIn,
          transform: `translate(-50%, -50%) scale(${0.86 + logoIn * 0.14})`,
        }}
      >
        <RelayLogo inverse size={96} />
        <h1>Architecture for decisions you can inspect.</h1>
        <p>One system trace. Every claim attached.</p>
      </div>
      <svg viewBox="0 0 1920 1080">
        <path
          d="M-40 760 C360 540, 650 880, 1010 640 S1570 480, 1980 690"
          fill="none"
          pathLength="1"
          stroke={COLORS.blue}
          strokeDasharray="1"
          strokeDashoffset={
            1 -
            interpolate(frame, [34, 150], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
          strokeWidth="3"
        />
      </svg>
    </div>
  );
};
