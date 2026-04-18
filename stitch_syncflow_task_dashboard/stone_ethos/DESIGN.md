# Design System Document: Slate & Stone Editorial

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Silent Architect."** 

This system rejects the frantic, high-contrast aesthetic of modern SaaS in favor of a calm, curated environment. It draws inspiration from high-end architectural monographs and editorial print design. We achieve a "Notion-inspired" feel not by copying their components, but by adopting their philosophy of "the UI as a canvas." 

To break the "template" look, designers must embrace **Intentional Asymmetry**. Large blocks of whitespace are used as structural elements, and typography scales are pushed to extremes—pairing oversized, airy headlines with meticulously tight, functional labels. This creates a rhythm that feels custom and premium, prioritizing the user's work over the interface itself.

---

### 2. Colors & Tonal Architecture
The palette is a sophisticated study in desaturation. We have removed all vibrant blues and energetic hues, replacing them with a spectrum of charcoal, stone, and slate.

#### The "No-Line" Rule
Standard UI relies on borders to separate sections. In this design system, **1px solid borders are prohibited for sectioning.** Boundaries must be defined through background color shifts or subtle tonal transitions. 
- Use `surface` (#f8f9fb) for the main canvas.
- Use `surface-container-low` (#f0f4f7) to define secondary content areas or sidebars.
- Transition to `surface-container` (#e8eff3) for interactive or nested zones.

#### Surface Hierarchy & Nesting
Think of the UI as physical layers of fine paper. 
- **Bottom Layer:** `surface` (The desk).
- **Middle Layer:** `surface-container` (The folder).
- **Top Layer:** `surface-container-lowest` (#ffffff) (The active sheet).
Nesting should always move toward the "lightest" or "deepest" tone to signify focus; never jump more than two tonal steps at once.

#### The "Glass & Gradient" Rule
To add "soul" to the slate aesthetic:
- **Glassmorphism:** For floating menus or overlays, use `surface` at 80% opacity with a `24px` backdrop blur. This prevents the UI from feeling "flat" or "dead."
- **Signature Textures:** Main CTAs should use a subtle vertical gradient from `primary` (#5a5f65) to `primary_dim` (#4e5358). This creates a "milled stone" effect that feels tactile and expensive.

---

### 3. Typography
We utilize **Inter** for its functional clarity, but we style it with an editorial eye.

- **Display & Headlines:** `display-lg` and `headline-lg` should be set with slightly tighter letter-spacing (-0.02em) to feel like a printed masthead. These are your "anchors."
- **Body:** `body-md` is the workhorse. It must always use `on_surface_variant` (#566166) for long-form reading to reduce eye strain, reserving `on_surface` (#2a3439) for headlines.
- **Labels:** `label-md` and `label-sm` should be used for metadata. In this system, labels are often set in all-caps with increased letter-spacing (+0.05em) to provide a "technical" contrast to the fluid body text.

---

### 4. Elevation & Depth
Depth in this system is an exercise in restraint. We move away from the "shadow-heavy" look of standard material design.

- **The Layering Principle:** Avoid shadows for static elements. A `surface-container-lowest` card placed on a `surface-container-low` background provides enough "natural lift" through tonal contrast alone.
- **Ambient Shadows:** When an element must float (e.g., a dropdown), use a shadow tinted with `on_surface`. 
  - *Spec:* `box-shadow: 0 12px 32px -4px rgba(42, 52, 57, 0.08);`
- **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use a **Ghost Border**. Apply `outline-variant` (#a9b4b9) at 20% opacity. It should be felt, not seen.
- **Tonal Contrast:** Use `surface-dim` (#cfdce3) as a background for high-intensity work areas to draw the eye inward and minimize glare.

---

### 5. Components

#### Buttons
- **Primary:** Background `primary` (#5a5f65), text `on_primary` (#f4f8ff). Use `md` (0.375rem) corner radius. No shadow.
- **Secondary:** Background `primary_container` (#dee3e9), text `on_primary_container` (#4d5258).
- **Tertiary:** No background. Text `primary`. Use a `surface-variant` background on hover.

#### Input Fields
- **Default:** Background `surface_container_lowest` (#ffffff) with a Ghost Border. 
- **Focus:** Transition border to `primary` at 50% opacity. No heavy outer glow.
- **Error:** Use `error` (#9f403d) text, but keep the input background a soft `error_container` (#fe8983) at 10% opacity.

#### Cards & Lists
- **Rule:** **Strictly forbid divider lines.** 
- Separate list items using 8px of vertical whitespace or a alternating subtle background shift between `surface` and `surface_container_low`.
- **Selection:** Use `secondary_container` (#dbe3ee) to highlight active rows.

#### Chips
- Use `xl` (0.75rem) or `full` roundedness. 
- Background `surface_container_high`, text `on_surface_variant`. This keeps them "quiet" until interacted with.

---

### 6. Do's and Don'ts

#### Do
- **Do** use `surface_container_highest` for "Empty State" illustrations to keep them subtle.
- **Do** utilize the `0.75rem` (xl) roundedness for large containers and `0.375rem` (md) for functional elements like buttons.
- **Do** embrace "asymmetric margins"—allow the left side of your layout to have more "breathing room" than the right to create an editorial flow.

#### Don't
- **Don't** use pure black (#000000) or pure white (#FFFFFF) except for the `surface_container_lowest` background. 
- **Don't** use any blue, even for links. Use `primary` with an underline or a bold weight to signify interactivity.
- **Don't** use 100% opaque borders. They interrupt the "Slate & Stone" flow. Always favor tonal shifts.
- **Don't** use standard "Pop" animations. Use slow, linear-out eases (e.g., 300ms) to maintain the calm, organized atmosphere.