# Ruth Talia Couture v18

Version 18 keeps the v17 English/Hebrew design but removes the paid server requirement:

- GitHub Pages hosts the static website.
- Google Sheets is Ruth's private administration and data store.
- Google Apps Script exposes the small API used by the website.
- Orders are requests only; the website never collects payment-card details.
- The browser cart is stored in `localStorage`.
- The API boundary is isolated in `public/api.js`, so Azure App Service and Azure SQL can replace Google later without redesigning the website.

## Architecture

```text
Browser on GitHub Pages
  ├─ Static English and Hebrew pages
  ├─ Responsive store, carousels, gallery, cart and calendar
  ├─ Local browser cart
  └─ public/api.js
             │
       Google Apps Script
  ├─ Input validation and anti-bot fields
  ├─ Request idempotency
  ├─ Atomic appointment locking
  ├─ Server-side price calculation
  └─ Email notifications
             │
       Private Google Sheet
  ├─ Settings
  ├─ Products
  ├─ Availability
  ├─ Orders
  └─ Appointments
```

No Google credential is stored in GitHub or sent to the browser. The public Apps Script URL is an API address, not a secret.

The browser uses JSONP only for read-only catalog, availability and request-status responses. Form data is sent separately with `POST`; sensitive customer data is never returned through JSONP. This avoids cross-origin browser dependencies while keeping JSONP read-only.

## Local preview

Requires Node.js 22 or newer.

```bash
cd /Users/yakovelmaleh/ruth-talia-couture-website/versions/v18-github-pages-sheets
npm install
npm start
```

Open:

- English: `http://localhost:8787/`
- Hebrew: `http://localhost:8787/he/`

Without an Apps Script URL, the full catalog and cart work in demonstration mode. Order and appointment submission remain disabled at the API layer and display a clear configuration message.

## One-time Google setup

### 1. Create the private spreadsheet

1. Sign in to the Google account Ruth will control.
2. Create a blank Google Sheet named **Ruth Talia Store**.
3. Open **Extensions → Apps Script**.
4. Replace the editor's code with `google-apps-script/Code.gs`.
5. Open **Project Settings**, enable the manifest file, and replace it with `google-apps-script/appsscript.json`.
6. Save and run `setupStore`.
7. Approve the requested spreadsheet and email permissions.

`setupStore` creates the Settings, Products, Availability, Orders and Appointments sheets. It also generates appointment times for the next 12 weeks:

- Sunday through Thursday
- 10:00–18:00
- 13:00–14:00 excluded
- Friday and Saturday excluded

Running `setupStore` again is safe: it does not replace existing products or requests. Use **Ruth Talia Store → Generate next 12 weeks** whenever more future slots are needed.

### 2. Configure Ruth's email

In the private `Settings` sheet, replace `ruth@example.com` in `notifyEmail` with Ruth's real email address. A successful order or appointment sends:

1. Full request details to Ruth.
2. A confirmation to the customer.

The request is saved before email is attempted. If Google email delivery fails or reaches its daily quota, the API reports that separately and the saved row remains available.

### 3. Deploy Apps Script

1. In Apps Script, select **Deploy → New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set access to **Anyone**.
5. Deploy and copy the `/exec` URL, not the `/dev` testing URL.
6. Paste that URL into `public/runtime-config.js`:

```js
window.RUTH_TALIA_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
};
```

The endpoint must be publicly callable because customers do not sign in with Google. The spreadsheet itself remains private.

Whenever `Code.gs` changes, create a new Apps Script deployment version and keep the `/exec` URL current.

## Everyday administration

### Products

Edit the `Products` sheet:

- Keep `id` unique and numeric.
- Use `bridal`, `evening`, or `signature` for `category`.
- Enter image URLs separated by `|`.
- Leave `price` empty for consultation-only couture.
- Set `active` to `TRUE` or `FALSE`.
- Use `sortOrder` to control display order.

The checked-in `config/products.seed.json` is the offline fallback shown if Google cannot be reached. Google Sheets becomes the live catalog after the API URL is configured.

### Appointment availability

Edit the `Availability` sheet:

- `OPEN` appears on the public calendar.
- `CLOSED` hides a time.
- `BOOKED` is set automatically and must not be reopened unless the appointment is cancelled intentionally.
- `closureReason` is private and may explain why a time was closed.

The backend acquires a script lock and rechecks the row before booking. Two customers cannot successfully reserve the same slot.

### Orders and appointments

Treat the `Orders` and `Appointments` sheets as private customer records:

- Never publish these sheets.
- Do not share them with public links.
- Restrict access to Ruth and trusted staff.
- Export a periodic backup from Google Sheets.

Customer text is neutralized before being written to cells to prevent spreadsheet formulas. Duplicate request IDs are returned without creating duplicate rows, and repeated submissions from the same email are temporarily throttled.

## GitHub Pages deployment

The repository workflow `.github/workflows/deploy-pages.yml`:

1. Installs the v18 build dependency.
2. Runs syntax checks and tests.
3. Generates `dist/index.html` and `dist/he/index.html`.
4. Uploads only `dist/` to GitHub Pages.

After the pull request is merged:

1. Open the GitHub repository **Settings → Pages**.
2. Select **GitHub Actions** as the source if it is not already selected.
3. Run **Deploy Ruth Talia to GitHub Pages** from the Actions tab, or let the merge trigger it.

The site will be available at the repository's `github.io` project URL. A custom domain can be added later in GitHub Pages settings.

## Security and limitations

- Never place spreadsheet IDs, OAuth tokens, service-account keys or private data in browser code.
- The Apps Script endpoint is public, so the implementation validates fields, includes a honeypot, rejects unrealistically fast submissions, throttles repeated email submissions and uses request IDs.
- Google Apps Script and email have daily quotas and no production SLA.
- Google Sheets is suitable for an initial low-volume launch, not a high-volume transactional store.
- Payment must use a hosted payment provider. Do not add card-number fields.
- GitHub Pages provides static hosting only; there is no server-side admin page.

## Moving to Azure later

Keep the browser contract implemented by `public/api.js`:

- `GET ?action=bootstrap` returns `{ ok, products, slots }`.
- `POST { action: "createOrder", ... }` returns an order number.
- `POST { action: "createAppointment", ... }` returns an appointment number.

An Azure API can implement the same contract while storing data in Azure SQL. At migration time:

1. Export Products, Availability, Orders and Appointments as CSV.
2. Import them into Azure SQL.
3. Deploy the replacement API.
4. Change only `apiUrl` in `public/runtime-config.js`.

The static website, bilingual design and customer workflow can remain unchanged.
