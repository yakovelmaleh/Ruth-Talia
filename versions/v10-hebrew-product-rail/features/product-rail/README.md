# Reusable product rail

This optional storefront feature shows four products at a time on desktop, two on tablet, and one on narrow mobile screens. Visitors can use the outer `<` and `>` controls or swipe the product row to reveal the remaining products.

## Files

- `public/features/product-rail/style.css` controls visible card counts, snapping, and rail arrows.
- `public/features/product-rail/client.js` moves one visible page at a time and resets the rail after filtering.
- `views/store.ejs` contains the small `data-product-rail` wrapper and controls.

The image carousel inside each product remains independent: its inner arrows change that dress's pictures, while clicking the picture opens the same details dialog as **View details**.
