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

## Shape and spacing

- Small radius: 10px.
- Control radius: 12px.
- Card radius: 16px.
- Feature panel radius: 24px.
- Primary controls: approximately 46-48px high.
- Use a 4px base spacing rhythm, with generous section intervals.

## Typography

Use Geist first and Inter/system sans as fallbacks. Prefer sentence case. Body text targets comfortable 1.5-1.7 line height. Display headings use tight tracking but must remain legible on mobile.

## Motion

- Standard UI transition: 180-220ms.
- Page entrance: about 400ms, opacity plus no more than 8px vertical movement.
- List stagger: about 60ms only when it helps order become clear.
- Hover lift: at most 1px; card scale should not exceed 1.01.
- Respect `prefers-reduced-motion` and remove non-essential movement.
