# Reusable gallery rail

This optional module gives the editorial Gallery the same soft transform-based page movement as the product collection.

- Three images are visible on desktop.
- Two images are visible on tablet.
- One image is visible on mobile.
- The `<` and `>` controls move one complete gallery page.
- Mouse and finger dragging use the same soft easing as the product rail.

The implementation is isolated in `public/features/gallery-rail/`. The storefront only needs the small `data-gallery-rail` wrapper in `views/store.ejs`.
