# Ruth Talia Couture v6

A mobile-first, bilingual storefront with triple-copy infinite touch carousels. Product cards, product details, and the editorial gallery all swipe continuously. Appointment selection uses a visual calendar backed exclusively by Ruth's open slots.

## Architecture

```text
Browser
  ├─ Server-rendered English/Hebrew storefront
  ├─ Small JavaScript client for dialogs and API calls
  └─ Responsive CSS for desktop, tablet, and mobile
             │
          Express
  ├─ Storefront rendering
  ├─ Cart and order API
  ├─ Appointment and availability API
  ├─ SMTP email notifications
  └─ Password-protected admin
             │
     Node built-in SQLite
  ├─ Products and inventory
  ├─ Persistent carts
  ├─ Saved orders
  ├─ Ruth's open calendar slots
  └─ Appointment requests and reservations
```

The project uses Node's built-in SQLite implementation. Express renders the application, EJS provides server-side templates, and Nodemailer sends messages through the configured SMTP provider.

## Run locally

Requires Node.js 22.5 or newer.

```bash
cd /Users/yakovelmaleh/ruth-talia-couture-website/versions/v6-calendar-card-swipe
npm install
ADMIN_PASSWORD='choose-a-local-password' \
NOTIFY_EMAIL='ruth@example.com' \
SMTP_HOST='smtp.example.com' \
SMTP_PORT='587' \
SMTP_USER='smtp-user' \
SMTP_PASSWORD='smtp-password' \
SMTP_FROM='Ruth Talia Couture <ruth@example.com>' \
npm start
```

Open:

- Store: `http://localhost:8787`
- Hebrew: `http://localhost:8787/?lang=he`
- Admin: `http://localhost:8787/admin`

The admin username defaults to `admin`. The browser displays a standard username/password prompt.

## Everyday editing

### Add or edit a dress

1. Open `/admin`.
2. Select **Add product**, or expand an existing product.
3. Enter both English and Hebrew text.
4. Enter the price in whole shekels. Leave it empty for a consultation-only couture item.
5. Add at least two image URLs, one per line. The first is the catalog cover. Images are placed side by side in a smooth native carousel.
6. Add inventory, badge, and visibility.
7. Save. The storefront updates immediately.

Products changed in the admin are stored in `data/store.sqlite`. They are not stored in the HTML.

### Open appointment slots

1. Open `/admin#calendar`.
2. Select a future date, start time, duration, and whether the appointment is at the atelier or online.
3. Select **Open slot**.
4. The slot immediately appears in the public appointment form.
5. When a client chooses it, the booking is transactional: the slot is reserved once and disappears from public availability.

Booked slots remain in the admin history and cannot be deleted accidentally.
Clients cannot type or select an arbitrary appointment date. The public form only accepts a currently open slot created by Ruth, and the backend enforces the same rule even if someone bypasses the page.

If Ruth has not opened any future slots, the public appointment selector and submit button are disabled. The customer must wait until Ruth publishes availability.
The customer sees a month calendar. Only days containing an open slot are clickable. Selecting a day reveals only the still-available times for that date.

### Edit the editorial gallery

Edit the `gallery` array in `config/site.json`. Each entry has an `imageUrl` and bilingual `caption`. The carousel keeps three copies internally and silently recenters in the middle copy, producing a true modulo sequence in either direction.

### Configure email delivery

Copy the values from `.env.example` into the production environment:

| Variable | Purpose |
|---|---|
| `NOTIFY_EMAIL` | Ruth/atelier mailbox that receives every request |
| `SMTP_HOST` / `SMTP_PORT` | Mail server |
| `SMTP_SECURE` | `true` for implicit TLS, normally port 465 |
| `SMTP_USER` / `SMTP_PASSWORD` | SMTP credentials |
| `SMTP_FROM` | Verified sender name and address |

Each successful appointment or message sends:

1. Full request details to `NOTIFY_EMAIL`
2. A confirmation message to the client's email address

The appointment is always saved first. If mail is not configured or delivery fails, the browser reports that clearly and Ruth can still read the request in `/admin`.

### Edit brand text, colors, contact details, or main images

Edit `config/site.json`, then restart the server. Important sections:

| Section | Controls |
|---|---|
| `brand` | Name and descriptor |
| `seo` | Browser title and search description |
| `theme` | Site colors |
| `contact` | Phone, email, address, Instagram |
| `commerce` | Currency, available sizes, shipping notice |
| `images` | Hero, designer-story, and atelier images |
| `gallery` | Editorial gallery images and bilingual captions |
| `calendar` | Time zone and default appointment duration |
| `copy` | English and Hebrew headline/story content |

Every bilingual value uses this structure:

```json
{
  "en": "English text",
  "he": "טקסט בעברית"
}
```

### Reset the local catalog

`config/products.seed.json` is used only when a database is created for the first time. To start a fresh local database, stop the server and remove only `data/store.sqlite`, then restart. Do not do this on a live site because it deletes products, carts, orders, and appointments.

## Mobile support

The storefront is designed mobile-first and includes:

- Touch-friendly navigation, product filters, size controls, forms, and cart
- Two-column products on small screens
- Full-screen mobile menu
- Mobile cart drawer and product dialogs
- Infinite native touch swipe on every selling-dress card and in product details
- Infinite side-by-side editorial gallery
- Bare `<` and `>` controls inside imagery with no shape or background
- Clickable availability calendar with enabled days and selectable time chips
- Mobile-friendly appointment slot selection
- Responsive story, atelier, checkout, and appointment layouts
- Proper English LTR and Hebrew RTL behavior

Test at minimum at widths 375, 430, 768, 1024, and 1440 pixels before publishing.

## Saved server data

The SQLite file is `data/store.sqlite`. In production it must be stored on persistent disk and backed up. The current checkout saves an order but does not charge a card. A payment provider and order confirmation service must be connected before launch.

## Production checklist

1. Set a strong `ADMIN_PASSWORD`; never use the default.
2. Replace all placeholder contact information and images.
3. Add a supported payment provider and verify Israeli tax/invoice requirements.
4. Configure and verify the production SMTP provider.
5. Add delivery, returns, privacy, accessibility, and terms pages.
6. Move uploaded product images to managed object storage or a media service.
7. Put the application behind HTTPS and a production process manager.
8. Back up the SQLite database, or migrate the same data layer to PostgreSQL if traffic requires multiple application instances.

## Reuse for another website

1. Copy this whole `v6-calendar-card-swipe` folder into a new project/version folder.
2. Replace `config/site.json`.
3. Replace `config/products.seed.json`.
4. Adjust `views/store.ejs` only if the page structure changes.
5. Adjust `public/site.css` for a different visual identity.
6. Keep `src/database.js`, the cart/order API, and admin workflow as the reusable commerce core.

This separation lets future websites reuse the backend without copying a large standalone HTML file.
