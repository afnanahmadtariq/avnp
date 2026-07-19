# Design tokens

Status: Canonical foundation  
Owner: Product design  
Last reviewed: 2026-07-19

The source of truth for implemented CSS variables is `packages/ui/src/styles.css`. This table documents their intent.

## Color

| Role           | Value     | Use                                       |
| -------------- | --------- | ----------------------------------------- |
| Background     | `#F5F4EF` | Warm page canvas                          |
| Surface        | `#FFFFFF` | Cards and controls                        |
| Primary text   | `#101114` | Main content and primary action           |
| Secondary text | `#666A73` | Supporting labels and explanations        |
| Border         | `#E5E3DC` | Default separation                        |
| Strong border  | `#D4D1C8` | Interactive and structural separation     |
| Accent         | `#3157F6` | Current activity and selected state       |
| Signal mint    | `#86E6B3` | Brand path entry and positive signal      |
| Success        | `#16835C` | Confirmed, completed, and verified saving |
| Warning        | `#B86C0D` | Missing fees, outliers, and review states |

Color never carries status alone; pair it with text, icon, or shape.

## Typography

Use Geist first and Inter/system sans as fallbacks. Prefer sentence case and preserve these role boundaries across marketing and product surfaces.

| Role          | Token                        | Value                             |
| ------------- | ---------------------------- | --------------------------------- |
| Page title    | `--relay-text-page-title`    | `clamp(2rem, 3vw, 2.75rem)`       |
| Section title | `--relay-text-section-title` | `1.25rem`                         |
| Card title    | `--relay-text-card-title`    | `1rem`                            |
| Body          | `--relay-text-body`          | `0.9375rem`                       |
| Control       | `--relay-text-control`       | `0.875rem`                        |
| Metadata      | `--relay-text-meta`          | `0.75rem` minimum meaningful text |

Body copy uses `--relay-leading-body` (`1.55`). Headings use `--relay-leading-heading` (`1.25`) or `--relay-leading-tight` (`1.1`) for large display type. Metadata uses `--relay-leading-meta` (`1.4`). Display headings may use tighter tracking but must remain legible on mobile.

## Shape and spacing

- Small radius: 10px.
- Control radius: 12px.
- Card radius: 16px.
- Feature panel radius: 24px.
- Primary controls: approximately 46-48px high.
- Use the canonical 4px spacing scale: `--relay-space-1`, `2`, `3`, `4`, `5`, `6`, `8`, `10`, `12`, `16`, and `24` (4px through 96px).
- Page gutters are 40px on desktop, 24px on tablet, and 16px on mobile.

## Layout

- Narrow content: `--relay-width-narrow` (`960px`).
- Standard application content: `--relay-width-standard` (`1200px`).
- Wide dashboards and marketing: `--relay-width-wide` (`1360px`).
- Standard responsive thresholds are 640px, 768px, 1024px, and 1280px. Introduce a custom threshold only when the content itself requires one.

## Motion

- Standard UI transition: 180-220ms.
- Page entrance: about 400ms, opacity plus no more than 8px vertical movement.
- List stagger: about 60ms only when it helps order become clear.
- Hover lift: at most 1px; card scale should not exceed 1.01.
- Respect `prefers-reduced-motion` and remove non-essential movement.
