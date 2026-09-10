# Ruth Talia Couture v2

A mobile-first, bilingual storefront in which the backend owns the catalog, carts, orders, appointment requests, and page configuration. The browser contains only presentation and interaction code.

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
  ├─ Appointment API
  └─ Password-protected admin
             │
     Node built-in SQLite
  ├─ Products and inventory
  ├─ Persistent carts
  ├─ Saved orders
  └─ Appointment requests
```

The project uses Node's built-in SQLite implementation, so the only external packages are Express and EJS.

## Run locally

Requires Node.js 22.5 or newer.

```bash
cd /Users/yakovelmaleh/ruth-talia-couture-website/versions/v2-backend
npm install
ADMIN_PASSWORD='choose-a-local-password' npm start
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
5. Add an image URL, inventory, badge, and visibility.
6. Save. The storefront updates immediately.

Products changed in the admin are stored in `data/store.sqlite`. They are not stored in the HTML.

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
- Responsive story, atelier, checkout, and appointment layouts
- Proper English LTR and Hebrew RTL behavior

Test at minimum at widths 375, 430, 768, 1024, and 1440 pixels before publishing.

## Saved server data

The SQLite file is `data/store.sqlite`. In production it must be stored on persistent disk and backed up. The current checkout saves an order but does not charge a card. A payment provider and order confirmation service must be connected before launch.

## Production checklist

1. Set a strong `ADMIN_PASSWORD`; never use the default.
2. Replace all placeholder contact information and images.
3. Add a supported payment provider and verify Israeli tax/invoice requirements.
4. Add email or CRM notifications for orders and appointments.
5. Add delivery, returns, privacy, accessibility, and terms pages.
6. Move uploaded product images to managed object storage or a media service.
7. Put the application behind HTTPS and a production process manager.
8. Back up the SQLite database, or migrate the same data layer to PostgreSQL if traffic requires multiple application instances.

## Reuse for another website

1. Copy this whole `v2-backend` folder into a new project/version folder.
2. Replace `config/site.json`.
3. Replace `config/products.seed.json`.
4. Adjust `views/store.ejs` only if the page structure changes.
5. Adjust `public/site.css` for a different visual identity.
6. Keep `src/database.js`, the cart/order API, and admin workflow as the reusable commerce core.

This separation lets future websites reuse the backend without copying a large standalone HTML file.
