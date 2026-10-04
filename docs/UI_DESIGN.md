# ProphyLens chess studio

## Direction

Premium consumer chess study workspace, with silver and graphite surfaces, an oversized
chessboard, quiet blue accents and restrained glass controls.
DESIGN_VARIANCE: 6. MOTION_INTENSITY: 5. VISUAL_DENSITY: 4.
The application requires more precision and less decorative variation than a marketing page.

Applied the design-taste-frontend skill's typography, material, hierarchy, motion and
redesign guidance to the user's explicitly requested product interface.
Native CSS preserves the existing React/Vite architecture. The glass is an
Apple-inspired web approximation; it does not claim to use Apple's native material APIs.

## Audit and response

- The previous first screen contained a large promotional headline and import form.
  The chessboard did not exist until analysis. A legal PGN preview now appears immediately.
- Unicode chess pieces depended on platform fonts. Local Apache-2.0 Chessnut SVGs now give
  all devices the same piece silhouettes and proportions.
- The previous review placed summary cards and the evaluation graph ahead of the board.
  The board now occupies the primary column, beside a compact move inspector.
- Board view controls and move navigation sit beside the board, while move evidence stays
  below it. The active move is indicated visually and through its pressed state.
- Growing analysis results previously shifted surrounding content. Import and cancel
  controls now remain in place until the search stops. Completed explicit analyses and
  opened library reviews bring keyboard focus to the review.
- Light and dark appearance use one shared token system. The default follows the system;
  the appearance control remembers an explicit choice on this device.
- The second board in Practice uses the same squares, pieces and interaction states.

## Materials and movement

The board and move list remain opaque for contrast. Navigation, segmented controls and
the import surface use a diffuse backdrop, a subtle directional highlight and a fine rim.
Unsupported blur and reduced-transparency modes use solid surfaces.

The glass rim resolves gently on entry; text and hit areas are fully present from
the first frame. Buttons keep fixed hit areas and provide inset press
feedback; their icons move subtly on hover. The engine dot pulses only during loading or analysis.
Every animation and transition is disabled for reduced motion.
No continuous React render loop, scroll handler, new animation runtime or external font
request was added. System fonts remain local.

## Layout and states

Desktop: board at left, import or move inspector at right.
Tablet and phone: board first, then controls, move list, evaluation and import.
All nested grid tracks allow wrapping. Chess squares retain a 1:1 aspect ratio.
The PGN preview is clearly marked as not analysed. It resets when the game changes.
Parsed readiness is tied to the exact current PGN, and new text invalidates readiness
immediately. A delayed-worker regression checks that only the latest input is analysed.
Loading, cancellation, malformed imports, storage failures and empty libraries remain
visible. No sample engine results or invented improvement scores were introduced.

## Contextual preflight

The complete skill preflight was reviewed. Marketing-only requirements for photographs,
logo walls, bento diversity, sales CTAs, section layout counts and short legal paragraphs
do not apply to this study tool. Its central visual is the actual playable chess position.
The existing alpha identifier, engine receipt and fair-play/privacy notices are retained
because they describe the real product and its limitations.
Real analysis progress and piece-color dots communicate state, rather than decorate.
All control icons come from Phosphor; the evaluation graph encodes real engine data.
Chess artwork comes from its credited source, with its original licence.

Verification includes formatting, type checking, existing unit/integration tests,
Chromium and Firefox production journeys, accessibility checks in both appearances,
square-board and overflow checks from 320px to 1440px, visual inspection and Lighthouse.
Detailed observed results are in the separate publication evidence report.
