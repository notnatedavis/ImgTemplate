Given the current project structure PROJECT/[CONTENTS] , with more detailed information within ReadMe md , 

I seek to focus on [INTENTION]. 


The output should ...
Core traits to preserve / improve in every change :

(Clean & Simple, Efficient, Intuitive, Robust, Modular, Organized, Optimized, Maintainable, Good Documentation & Insightful comments, Apt error handling) : {
1. Clean & simplistic – minimal, readable code; avoid premature abstraction.
2. Efficient – direct DOM updates, no unnecessary re‑renders or libraries.
3. Intuitive – UI should be self‑explanatory; interactions must follow standard patterns (drag, hover, sliders).
4. Robust – handle edge cases (non‑image files, missing elements, aspect‑ratio clamping, expanded crop bounds).
5. Modularization – keep utilities in separate files; uiController.js should stay the only file that wires DOM events and state.
6. Organization – group related code (state, DOM refs, helpers, event handlers) and comment each section.
7. Optimization – off‑screen canvas for final rendering, scale preview to fit, debounce if needed.
8. Maintainability – use clear variable names, avoid magic numbers (declare constants at the top), and keep functions focused.
9. Reusability – write small helper functions (e.g., clamp, clampCropRect, renderOutputCanvas) that can be reused if features grow.
10. Good documentation & comments – every file begins with a short description; complex logic has inline comments; JSDoc for exported functions where helpful.
11. Apt error handling – load errors, download failures, and invalid user inputs show user‑friendly messages (e.g., showError). }



Do not include anything extra or unnecessary unless explicitly asked to do so, The output (modified & relevant files only) should be in its whole entirety and copy the format and likeness of the existing code both in comments and stylistic spacing choices. Any visual design choices should reflect any existing visual design choices (colors, font sizes, placements, etc).