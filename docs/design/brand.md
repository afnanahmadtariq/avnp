# Brand and experience direction

Status: Canonical  
Owner: Product design  
Last reviewed: 2026-07-19

## Brand posture

The experience should feel calm, premium, and almost invisible. The customer reaction should be that the difficult work became effortless, not that they saw a flashy AI demonstration.

**Relay** is the final product name. Use it in product copy, application metadata, infrastructure labels, documentation, and the internal `@relay/*` package scope. Do not introduce a second working name.

## Personality

Relay is a professional assistant. It is not a robot mascot, a coupon product, or a “cheap deal” brand. Communication is direct, composed, transparent, and evidence-led.

## Experience principles

- One primary action per screen.
- Whitespace is a functional part of the interface.
- Typography carries hierarchy before color or decoration.
- Motion explains state change and reduces perceived waiting.
- The user can always tell what is happening, why it matters, and what remains under their control.
- Price is paired with completeness and trust; the lowest number is not automatically celebrated.
- Evidence is reachable from every important claim.

## Interface language

Prefer status language that describes work:

```text
Interviewing -> Ready for review -> Confirmed
Queued -> Calling -> Gathering quote -> Negotiating -> Completed
Comparing -> Recommendation ready
```

Avoid generic “Loading...” when a more useful state is known. When a quote improves, show the before value, reason, after value, and changed terms.

## Visual direction

- Warm ivory and white surfaces with graphite text.
- Cobalt for primary action, signal mint for verified progress, and amber only for risk.
- No gradients, neon, purple AI tropes, stock vectors, or decorative cartoons.
- Geist or Inter with weights generally between 300 and 600.
- Subtle borders, 16px-class card radii, and barely visible shadows.
- Lucide is the single planned icon set.
- Page and list motion remains short, low-distance, and optional under reduced-motion preferences.

The preserved source direction and logo explorations are available in [the original brand notes](../references/originals/system-design.md) and [brand concepts](../../assets/brand/concepts/README.md).

## Logo system

The production mark is a connected geometric `R`: the mint entry node represents the customer's confirmed brief, the continuous path represents the calls and comparison process, and the cobalt exit node represents a verified decision.

- [Relay mark](../../assets/brand/relay-mark.svg)
- [Relay horizontal lockup](../../assets/brand/relay-lockup.svg)
- [Asset usage notes](../../assets/brand/README.md)

Archived concepts are reference material only and must not appear in the product interface.
