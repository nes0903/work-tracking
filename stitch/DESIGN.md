# Design System Specification: The Executive Architect

## 1. Overview & Creative North Star
The "Executive Architect" is the Creative North Star for this design system. We are moving away from the "SaaS-in-a-box" aesthetic toward a **High-End Editorial** experience. The system is built on the principle of *Structural Fluidity*—where professional data visualization meets the breathing room of a luxury print magazine.

To break the "template" look, we employ **intentional asymmetry**. Do not feel forced to align every card in a rigid 3-column grid. Use the `display-lg` typography to anchor pages, and allow for overlapping elements where a floating glass card might partially obscure a background tonal shift. This creates a sense of curated depth rather than automated placement.

---

## 2. Colors: Tonal Architecture
Our palette is anchored in Deep Blue and Slate Grey, but its sophistication comes from how we layer these tones.

### The "No-Line" Rule
**Explicit Instruction:** Traditional 1px solid borders (`#D1D5DB` or similar) are strictly prohibited for sectioning. Boundaries must be defined solely through background color shifts. 
*   *Implementation:* Use a `surface-container-low` section sitting directly on a `surface` background to denote a change in context.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of frosted glass.
*   **Base:** `surface` (#F8F9FA)
*   **Depth Level 1:** `surface-container-low` (#F3F4F5) for secondary sidebars or grouping areas.
*   **Depth Level 2:** `surface-container-lowest` (#FFFFFF) for primary content cards to provide maximum "pop" and clarity.
*   **Depth Level 3:** `surface-container-highest` (#E1E3E4) for recessed elements like search bars or inactive tabs.

### The "Glass & Gradient" Rule
To move beyond a standard feel, main CTAs and "Hero" cards should utilize a subtle linear gradient from `primary` (#005BBF) to `primary_container` (#1A73E8) at a 135-degree angle. For floating navigation or modal overlays, apply **Glassmorphism**: use `surface_container_lowest` at 80% opacity with a `24px` backdrop-blur.

---

## 3. Typography: The Editorial Voice
We use a dual-font strategy to balance authority with readability.

*   **Display & Headlines (Manrope):** This is our "Editorial" voice. Use `display-lg` for dashboard welcomes and `headline-sm` for card titles. The wider apertures of Manrope convey a modern, premium feel.
*   **Body & Labels (Inter):** This is our "Functional" voice. Inter is used for data density. `body-md` is the workhorse for all paragraph text, while `label-sm` (all-caps with 0.05em tracking) should be used for category tags to inject a technical, precise aesthetic.

---

## 4. Elevation & Depth: Tonal Layering
We reject the heavy drop-shadows of the early 2010s. Depth is achieved through **Ambient Light Physics**.

*   **The Layering Principle:** Instead of a shadow, place a `surface-container-lowest` (#FFFFFF) card on a `surface-container-low` (#F3F4F5) background. The 2% shift in brightness is enough for the human eye to perceive a "lift" without visual clutter.
*   **Ambient Shadows:** When a card must float (e.g., a hover state or a modal), use a shadow color tinted with the `on_surface` (#191C1D) token at 6% opacity.
    *   *Shadow Spec:* `0px 20px 40px rgba(25, 28, 29, 0.06)`
*   **The "Ghost Border" Fallback:** If a layout requires a boundary for accessibility (e.g., input fields), use the `outline_variant` token at **20% opacity**. Never use a 100% opaque border.

---

## 5. Components

### Buttons
*   **Primary:** Gradient fill (`primary` to `primary_container`), `md` (0.75rem) corner radius, white text. No shadow on rest; `4%` ambient shadow on hover.
*   **Tertiary (Ghost):** No background or border. Use `primary` text. This is for low-emphasis actions like "Cancel" or "View All."

### Cards & Lists
*   **The Rule of Separation:** Forbid divider lines. Separate list items using `12px` of vertical white space or by alternating background colors between `surface-container-low` and `surface-container-lowest`.
*   **Radius:** Primary cards must use the `lg` (1rem) radius to feel approachable yet professional.

### Input Fields
*   **Style:** Minimalist. No bottom line or full border. Use `surface_container_high` as a soft-filled background with a `sm` (0.25rem) radius. On focus, transition the background to `surface_container_lowest` and add a 1px "Ghost Border."

### Data Visualization
*   **Micro-Interactions:** Charts should not just appear; they should ease-in with a 400ms "Stagger" effect. 
*   **Color Usage:** Use `primary` for the main data line and `tertiary` (#9E4300) for "Warning" or "Alert" data points to ensure high-contrast professional urgency.

---

## 6. Do’s and Don’ts

### Do:
*   **DO** use negative space as a functional element. If a dashboard feels "empty," increase the typography scale rather than adding more borders or boxes.
*   **DO** use `surface_bright` for extremely small, high-priority "New" or "Live" indicators.
*   **DO** ensure all icons are "Line Art" style with a 1.5px stroke weight to match the Inter typography weight.

### Don’t:
*   **DON'T** use pure black (#000000) for text. Always use `on_surface` (#191C1D) to maintain a soft, high-end feel.
*   **DON'T** use "Standard" blue. Use the specified `primary` (#005BBF) which has been tuned for professional depth.
*   **DON'T** use 90-degree sharp corners. The minimum radius is `sm` (0.25rem), even for small chips. Sharp corners feel "default" and "unconsidered."