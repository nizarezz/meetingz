# UI Context

## Theme

Light and dark mode. The design language is earthy and warm — beige/cream surfaces with a sage green primary, inspired by natural and grounded aesthetics. Light mode is the default with warm neutral backgrounds; dark mode uses deep charcoal with muted green accents.

## Colors

All components must use these CSS custom property tokens — no hardcoded hex values.

### Light Mode (`:root`)

| Role                       | Variable                    | Hex       |
| -------------------------- | --------------------------- | --------- |
| Page background            | `--background`              | `#faf6f0` |
| Foreground / primary text  | `--foreground`              | `#2e3230` |
| Card surface               | `--card`                    | `#f0ece4` |
| Card foreground            | `--card-foreground`         | `#2e3230` |
| Popover                    | `--popover`                 | `#ffffff` |
| Primary                    | `--primary`                 | `#4a7c59` |
| Primary foreground         | `--primary-foreground`      | `#ffffff` |
| Primary container          | `--primary-container`       | `#78a886` |
| On primary container       | `--on-primary-container`    | `#002110` |
| Secondary                  | `--secondary`               | `#6b6358` |
| Secondary container        | `--secondary-container`     | `#f0e8db` |
| Muted foreground           | `--muted-foreground`        | `#4a4e4a` |
| Accent background          | `--accent`                  | `#e4e0d8` |
| Destructive / error        | `--destructive`             | `#b83230` |
| Border                     | `--border`                  | `#c4c8bc` |
| Outline                    | `--outline`                 | `#74796e` |
| Outline variant            | `--outline-variant`         | `#c4c8bc` |
| Surface container          | `--surface-container`       | `#f0ece4` |
| Surface container low      | `--surface-container-low`   | `#f5f1ea` |
| Surface container high     | `--surface-container-high`  | `#eae6de` |
| Ring                       | `--ring`                    | `#4a7c59` |
| Sidebar                    | `--sidebar`                 | `#f0ece4` |
| Sidebar primary            | `--sidebar-primary`         | `#4a7c59` |

### Dark Mode (`.dark`)

| Role                       | Variable                    | Hex       |
| -------------------------- | --------------------------- | --------- |
| Page background            | `--background`              | `#1a1c1b` |
| Foreground                 | `--foreground`              | `#e4e0d8` |
| Card surface               | `--card`                    | `#242625` |
| Primary                    | `--primary`                 | `#8ecf9e` |
| Primary container          | `--primary-container`       | `#2a6038` |
| Secondary container        | `--secondary-container`     | `#4a4538` |
| Surface container          | `--surface-container`       | `#242625` |
| Border                     | `--border`                  | `#3a3c38` |
| Sidebar                    | `--sidebar`                 | `#242625` |

## Typography

| Role            | Font          | Weight range | Variable           |
| --------------- | ------------- | ------------ | ------------------ |
| Display / headings | Literata (serif) | 400–700      | `--font-display`   |
| Body / UI       | Nunito Sans   | 400–700      | `--font-sans`      |
| Code / mono     | Geist Mono    | 400–700      | `--font-geist-mono`|

- `font-display` class for all headings (`h1`–`h6`). Use `font-bold` with this for emphasis.
- `font-sans` (default body) for all UI text, labels, and paragraphs.
- Page titles: `font-display text-3xl font-bold` or `font-display text-4xl font-bold tracking-tight`.
- Section headings within cards: `font-display text-xl font-bold`.

## Border Radius

| Context                  | Class            | Value   |
| ------------------------ | ---------------- | ------- |
| Inline / small UI        | `rounded`        | 0.5rem  |
| Cards / panels           | `rounded-xl`     | 1rem    |
| Modals / overlays        | `rounded-xl`     | 1.5rem  |
| Pills / badges / avatars | `rounded-full`   | 9999px  |
| Input fields             | `rounded-lg`     | 0.75rem |

## Component Library

shadcn/ui (style `base-nova`) on top of Tailwind v4. Components live in `components/ui/`. Use the shadcn CLI (`npx shadcn add`) to add new primitives rather than writing from scratch.

Currently installed primitives (21): avatar, badge, button, card, checkbox, dialog, dropdown-menu, input, label, radio-group, scroll-area, select, separator, sheet, skeleton, sonner, switch, table, tabs, textarea, tooltip.

## Layout Patterns

- **Authenticated app shell**: Fixed left sidebar (w-64) + vertical flex (topnav + scrollable main content + footer). Sidebar becomes overlay on mobile with backdrop.
- **Sidebar**: Fixed width (16rem / w-64), contains logo, 6 nav items stacked, "New Meeting" CTA, Help/Support/Sign out at the bottom. Active state uses `primary-container` background.
- **Topnav**: Minimal bar with hamburger (mobile), notification bell, user avatar badge.
- **Content area**: Scrollable `main` inside the authenticated layout. Max-width constraint applied per-page (e.g., `max-w-4xl mx-auto` for forms).
- **Cards**: `bg-surface rounded-xl p-8 shadow-sm border border-outline-variant/20` for form sections. `bg-surface rounded-xl p-6 soft-shadow border` for list items.
- **Floating action button**: Fixed bottom-right on mobile for "New Meeting" — `h-14 w-14 rounded-full shadow-lg`.
- **Dashboards / lists**: Scrollable container with sticky search/filter bar. Tab navigation with bottom-border active indicator.
- **Soft shadow utility**: Replicate the Terra mockup's `soft-shadow` by composing Tailwind: `shadow-[0_4px_20px_rgba(46,50,48,0.06)]`.

## Icons

Lucide React. Stroke-based icons only. Common sizes:
- `h-4 w-4` for inline / menu icons
- `h-5 w-5` for section headers and button icons
- `h-6 w-6` for FABs and large action buttons

## Animation

Transitions use `transition-colors duration-200` for interactive elements. Hover states on cards use `hover:border-primary/50 hover:shadow-sm`. Live status uses `animate-pulse` on the indicator dot.
