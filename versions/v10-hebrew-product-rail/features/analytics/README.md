# Reusable visitor analytics

This optional feature provides privacy-conscious, first-party website statistics without an external analytics provider.

## Included files

- `features/analytics/index.js` owns the analytics database, collection endpoint, filtering, and aggregation.
- `public/features/analytics/client.js` records one page view when the storefront loads.
- The `#insights` section in `views/admin.ejs` renders counters, breakdowns, filters, and the daily chart.
- Analytics data is stored separately in `data/analytics.sqlite`.

## Data collected

- Anonymous visitor UUID stored in an HTTP-only, same-site cookie
- Visit time, storefront path, and selected language
- Mobile, tablet, or desktop classification
- Referral hostname
- Browser time zone and viewport width
- Country only when the hosting platform provides `x-vercel-ip-country`, `cf-ipcountry`, or `x-country-code`

Raw IP addresses are not stored.

## Reuse in another Express website

1. Copy `features/analytics/` and `public/features/analytics/`.
2. Create the feature with `createAnalyticsFeature(rootDir)`.
3. Mount `analytics.router` at `/features/analytics`.
4. Include `/features/analytics/client.js` on public pages.
5. Render `analytics.dashboard(filters)` in a protected administration page.

## Remove the feature

Remove the two analytics folders, the analytics import/router/dashboard calls in `server.js`, the client script in `views/store.ejs`, and the insights section in `views/admin.ejs`. Commerce, appointments, and the main `data/store.sqlite` database remain unaffected.
