const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { createDatabase } = require("./src/database");
const { createEmailService } = require("./src/email");
const { createAnalyticsFeature } = require("./features/analytics");

const rootDir = __dirname;
const app = express();
const store = createDatabase(rootDir);
const analytics = createAnalyticsFeature(rootDir);
const siteConfigPath = path.join(rootDir, "config", "site.json");
const port = Number(process.env.PORT || 8787);
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "";

function readSiteConfig() {
  return JSON.parse(fs.readFileSync(siteConfigPath, "utf8"));
}

store.ensureDefaultSlots(readSiteConfig().calendar);

function locale(value) {
  return value === "he" ? "he" : "en";
}

function text(value, lang) {
  if (typeof value === "string") return value;
  return value?.[lang] || value?.en || "";
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, separator)), decodeURIComponent(part.slice(separator + 1))];
  }));
}

function cartSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.rt_cart) return cookies.rt_cart;
  const id = crypto.randomUUID();
  res.cookie("rt_cart", id, { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 30 });
  return id;
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!String(body[field] || "").trim()) {
      const error = new Error(`Missing required field: ${field}`);
      error.status = 400;
      throw error;
    }
  }
}

function adminAuth(req, res, next) {
  if (!adminPassword) return next();
  const credentials = Buffer.from((req.headers.authorization || "").replace(/^Basic /, ""), "base64").toString().split(":");
  const validUser = credentials[0] === adminUser;
  const supplied = Buffer.from(credentials[1] || "");
  const expected = Buffer.from(adminPassword);
  const validPassword = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!validUser || !validPassword) {
    res.set("WWW-Authenticate", 'Basic realm="Ruth Talia Admin"');
    return res.status(401).send("Authentication required.");
  }
  next();
}

app.set("view engine", "ejs");
app.set("views", path.join(rootDir, "views"));
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false, limit: "200kb" }));
app.use(express.static(path.join(rootDir, "public"), { maxAge: "1h" }));
app.use("/features/analytics", analytics.router);

app.get("/", (req, res) => {
  const lang = locale(req.query.lang);
  const site = readSiteConfig();
  res.render("store", {
    lang,
    dir: lang === "he" ? "rtl" : "ltr",
    site,
    text: value => text(value, lang),
    products: store.listProducts(),
    cart: store.getCart(cartSession(req, res)),
    slots: store.listAvailableSlots()
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/products", (_req, res) => res.json({ products: store.listProducts() }));
app.get("/api/cart", (req, res) => res.json(store.getCart(cartSession(req, res))));
app.post("/api/cart/items", (req, res, next) => {
  try {
    requireFields(req.body, ["productId", "size"]);
    const quantity = Math.max(1, Math.min(10, Number(req.body.quantity || 1)));
    res.status(201).json(store.addCartItem(cartSession(req, res), Number(req.body.productId), String(req.body.size), quantity));
  } catch (error) {
    next(error);
  }
});
app.delete("/api/cart/items/:productId/:size", (req, res) => {
  res.json(store.removeCartItem(cartSession(req, res), Number(req.params.productId), req.params.size));
});
app.post("/api/orders", (req, res, next) => {
  try {
    requireFields(req.body, ["name", "email", "phone"]);
    res.status(201).json(store.createOrder(cartSession(req, res), req.body));
  } catch (error) {
    next(error);
  }
});
app.post("/api/appointments", async (req, res, next) => {
  try {
    requireFields(req.body, ["name", "email", "phone", "slotId"]);
    const appointment = store.createAppointment(req.body);
    const emailService = createEmailService(readSiteConfig());
    let delivery;
    try {
      delivery = await emailService.sendAppointment({...req.body, ...appointment});
    } catch (emailError) {
      console.error("Appointment saved, but email delivery failed.", emailError);
      delivery = { delivered: false, reason: "The request was saved, but email delivery failed. Ruth can still see it in the admin page." };
    }
    res.status(201).json({...appointment, emailDelivered: delivery.delivered, emailWarning: delivery.reason || null});
  } catch (error) {
    next(error);
  }
});

app.get("/admin", adminAuth, (req, res) => {
  const lang = locale(req.query.lang);
  const slotFilters = {
    from: String(req.query.slotFrom || ""),
    to: String(req.query.slotTo || ""),
    status: String(req.query.slotStatus || "all"),
    limit: Number(req.query.slotLimit || 40)
  };
  res.render("admin", {
    products: store.listProducts({ includeInactive: true }),
    orders: store.listOrders(),
    appointments: store.listAppointments(),
    slots: store.listSlots(slotFilters),
    slotFilters,
    analytics: analytics.dashboard({
      from: String(req.query.analyticsFrom || ""),
      to: String(req.query.analyticsTo || ""),
      device: String(req.query.analyticsDevice || "all")
    }),
    lang,
    dir: lang === "he" ? "rtl" : "ltr",
    site: readSiteConfig()
  });
});
app.post("/admin/products", adminAuth, (req, res, next) => {
  try {
    requireFields(req.body, ["slug", "category", "nameEn", "nameHe", "imageUrls"]);
    store.createProduct(req.body);
    res.redirect(`/admin?lang=${locale(req.query.lang)}#products`);
  } catch (error) {
    next(error);
  }
});
app.post("/admin/products/:id", adminAuth, (req, res, next) => {
  try {
    requireFields(req.body, ["slug", "category", "nameEn", "nameHe", "imageUrls"]);
    store.updateProduct(Number(req.params.id), req.body);
    res.redirect(`/admin?lang=${locale(req.query.lang)}#products`);
  } catch (error) {
    next(error);
  }
});
app.post("/admin/slots/:id/toggle", adminAuth, (req, res, next) => {
  try {
    const body = req.body || {};
    store.toggleSlot(Number(req.params.id), body.reason);
    const query = new URLSearchParams({
      lang: locale(req.query.lang),
      slotFrom: body.slotFrom || "",
      slotTo: body.slotTo || "",
      slotStatus: body.slotStatus || "all"
    });
    res.redirect(`/admin?${query}#calendar`);
  } catch (error) {
    next(error);
  }
});
app.post("/admin/products/:id/delete", adminAuth, (req, res, next) => {
  try {
    store.deleteProduct(Number(req.params.id));
    res.redirect(`/admin?lang=${locale(req.query.lang)}#products`);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  console.error(error);
  const status = error.status || 500;
  if (req.path.startsWith("/api/")) return res.status(status).json({ error: error.message });
  res.status(status).send(`<h1>Request failed</h1><p>${String(error.message).replace(/[<>&"]/g, "")}</p>`);
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Ruth Talia Couture: http://localhost:${port}`);
    console.log(`Admin: http://localhost:${port}/admin`);
    if (!adminPassword) {
      console.warn("Admin authentication is disabled. Set ADMIN_PASSWORD before publishing.");
    }
  });
}

module.exports = { app };
