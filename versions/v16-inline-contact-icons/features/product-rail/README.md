# Reusable product rail

This optional storefront feature shows four products at a time on desktop, two on tablet, and one on narrow mobile screens. Visitors can use the outer `<` and `>` controls or drag the product row. Movement uses a transform and soft cubic easing like the individual image carousels.

## Files

- `public/features/product-rail/style.css` controls visible card counts, snapping, and rail arrows.
- `public/features/product-rail/client.js` provides pointer dragging, threshold-based page changes, soft animated transforms, responsive page sizes, and filter resets.
- `views/store.ejs` contains the small `data-product-rail` wrapper and controls.

The image carousel inside each product remains independent: its inner arrows change that dress's pictures, while clicking the picture opens the same details dialog as **View details**.
