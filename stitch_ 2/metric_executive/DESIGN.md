# Design System Document: Modern Professionalist

## 1. Overview & Creative North Star
This design system is engineered for executive environments where clarity is synonymous with authority. The goal is to move away from the cluttered, line-heavy interfaces of legacy enterprise software and toward a "High-End Editorial" experience.

**Creative North Star: The Architecturalist Executive**
The system treats the UI as a digital masterpiece of architecture. We prioritize **Spatial Authority**—the idea that generous white space and precise typography command more respect than loud colors or heavy borders. The design breaks the "template" look through intentional asymmetry: sidebars may use deep tonal shifts (`surface_container_highest`), while the main canvas remains airy and expansive (`surface`). By overlapping elements and utilizing high-contrast typography scales, we create a sense of curated, calm precision.

---

## 2. Colors & Surface Philosophy
The palette is a sophisticated blend of deep navy and cool architectural grays. It is designed to be easy on the eyes during long periods of data analysis while maintaining a "premium" weight.

### The "No-Line" Rule
To achieve a high-end feel, designers are **prohibited from using 1px solid borders** to define major sections. Structural boundaries must be created through background color shifts. 
*   **Example:** A navigation sidebar using `surface_container_high` should sit directly against a main content area using `surface`. The shift in tone is the boundary.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers, like stacked sheets of heavy-stock paper.
*   **Base Layer:** `surface` (#f7f9fb) – The global background.
*   **Sectional Layers:** Use `surface_container_low` or `surface_container` to group related content blocks.
*   **Actionable Layers:** Use `surface_container_lowest` (#ffffff) for cards or white papers that "lift" off the gray background.

### Glass & Gradient Transitions
To avoid a flat "Bootstrap" appearance:
*   **The Glass Rule:** Use semi-transparent `surface_container_lowest` with a `backdrop-blur` (20px+) for floating menus or modals. 
*   **Signature Textures:** For primary call-to-actions, use a subtle linear gradient from `primary` (#3c608a) to `primary_dim` (#2f547d). This provides a "brushed metal" or "high-end fabric" depth that flat hex codes cannot replicate.

---

## 3. Typography
We use **Manrope** for its sharp, geometric clarity. It bridges the gap between a classic grotesque and a modern tech font.

*   **Display & Headline (The Statement):** `display-lg` through `headline-sm` should have a slightly tighter letter-spacing (-0.02em) to look authoritative and "locked in."
*   **Body (The Readability):** `body-lg` and `body-md` are for long-form data. Use generous line-height (1.6) to prevent executive fatigue.
*   **Labels (The Utility):** `label-md` and `label-sm` should be used sparingly for metadata. Use `on_surface_variant` (#566166) to keep these elements from competing with primary data.

**Editorial Tip:** Use `headline-lg` in `on_primary_container` for section headers to create a sophisticated, low-contrast tonal anchor.

---

## 4. Elevation & Depth
In this design system, depth is a result of **Tonal Layering** rather than structural shadows.

*   **The Layering Principle:** Place a `surface_container_lowest` card on top of a `surface_container_low` background. The natural contrast creates a soft "lift" that feels integrated, not "pasted on."
*   **Ambient Shadows:** If an element must float (e.g., a dropdown or modal), use an ultra-diffused shadow. 
    *   *Specs:* `Y: 12px, Blur: 32px, Spread: 0, Color: rgba(42, 52, 57, 0.06)` (a tinted version of `on_surface`).
*   **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use a "Ghost Border." Apply `outline_variant` (#a9b4b9) at **15% opacity**. This creates a suggestion of a line without breaking the minimalist aesthetic.

---

## 5. Components

### Buttons
*   **Primary:** Solid `primary` (#3c608a) with `on_primary` text. Use `md` (0.375rem) roundedness for a sharp, professional look.
*   **Secondary:** `primary_container` (#d2e4ff) background with `on_primary_container` text. No border.
*   **Tertiary:** Ghost style. No background, `on_primary_fixed` text. Use for low-priority actions like "Cancel."

### Input Fields
*   **Design:** Use a subtle `surface_container_high` background. Replace the 4-sided border with a 2px bottom-accent in `outline` (#717c82) that transforms to `primary` on focus. This mimics the "executive notepad" feel.

### Cards & Data Lists
*   **Forbid Dividers:** Do not use horizontal lines between list items. Instead, use a 16px or 24px vertical gap.
*   **Grouped Lists:** Use alternating background tones (e.g., `surface` and `surface_container_low`) for large data tables to maintain row-tracking without grid lines.

### Executive KPI Chips
*   A custom component for this system. High-value metrics should be housed in a `surface_container_highest` chip with a `label-sm` heading and a `title-lg` value in `on_surface`.

---

## 6. Do's and Don'ts

### Do:
*   **Use Asymmetry:** Place high-level summaries in a wider left column and utility tools in a narrower right column.
*   **Embrace Margin:** If you think there is enough margin, add 8px more. Space is luxury.
*   **Tonal Consistency:** Use `on_surface` (#2a3439) for all primary text to maintain the "Deep Navy" authoritative feel.

### Don't:
*   **No Vibrant Accents:** Never use pure reds or greens for status. Use `error` (#9f403d) and `primary` variants to keep the "muted" executive vibe.
*   **No Hard Shadows:** Avoid the standard "Material Design" shadows. They feel too "app-like" and not "executive" enough.
*   **No Borders:** Avoid 100% opaque borders at all costs. They create visual noise that distracts from the data.
*   **No Dark Mode:** This design system is optimized exclusively for a "Paper-and-Ink" light-mode experience to maintain the sense of a physical executive suite.