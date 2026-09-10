const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function asBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
}

function createDatabase(rootDir) {
  const dataDir = path.join(rootDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "store.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      name_en TEXT NOT NULL,
      name_he TEXT NOT NULL,
      subtitle_en TEXT NOT NULL DEFAULT '',
      subtitle_he TEXT NOT NULL DEFAULT '',
      description_en TEXT NOT NULL DEFAULT '',
      description_he TEXT NOT NULL DEFAULT '',
      price INTEGER,
      image_url TEXT NOT NULL,
      badge_en TEXT NOT NULL DEFAULT '',
      badge_he TEXT NOT NULL DEFAULT '',
      inventory INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      cart_id TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      PRIMARY KEY (cart_id, product_id, size)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      items_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      event_date TEXT,
      occasion TEXT,
      consultation_type TEXT,
      message TEXT,
      language TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  if (productCount === 0) {
    const seeds = JSON.parse(fs.readFileSync(path.join(rootDir, "config", "products.seed.json"), "utf8"));
    const insert = db.prepare(`
      INSERT INTO products (
        slug, category, name_en, name_he, subtitle_en, subtitle_he,
        description_en, description_he, price, image_url, badge_en,
        badge_he, inventory, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of seeds) {
      insert.run(
        item.slug, item.category, item.nameEn, item.nameHe, item.subtitleEn,
        item.subtitleHe, item.descriptionEn, item.descriptionHe, item.price,
        item.imageUrl, item.badgeEn, item.badgeHe, item.inventory, item.active ? 1 : 0
      );
    }
  }

  const mapProduct = row => row && ({
    id: row.id,
    slug: row.slug,
    category: row.category,
    nameEn: row.name_en,
    nameHe: row.name_he,
    subtitleEn: row.subtitle_en,
    subtitleHe: row.subtitle_he,
    descriptionEn: row.description_en,
    descriptionHe: row.description_he,
    price: row.price,
    imageUrl: row.image_url,
    badgeEn: row.badge_en,
    badgeHe: row.badge_he,
    inventory: row.inventory,
    active: Boolean(row.active)
  });

  return {
    listProducts({ includeInactive = false } = {}) {
      const rows = db.prepare(`SELECT * FROM products ${includeInactive ? "" : "WHERE active = 1"} ORDER BY id`).all();
      return rows.map(mapProduct);
    },
    getProduct(id) {
      return mapProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(id));
    },
    createProduct(input) {
      const result = db.prepare(`
        INSERT INTO products (
          slug, category, name_en, name_he, subtitle_en, subtitle_he,
          description_en, description_he, price, image_url, badge_en,
          badge_he, inventory, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.slug, input.category, input.nameEn, input.nameHe, input.subtitleEn || "",
        input.subtitleHe || "", input.descriptionEn || "", input.descriptionHe || "",
        input.price === "" ? null : Number(input.price), input.imageUrl, input.badgeEn || "",
        input.badgeHe || "", Number(input.inventory || 0), asBoolean(input.active) ? 1 : 0
      );
      return this.getProduct(result.lastInsertRowid);
    },
    updateProduct(id, input) {
      db.prepare(`
        UPDATE products SET
          slug = ?, category = ?, name_en = ?, name_he = ?, subtitle_en = ?,
          subtitle_he = ?, description_en = ?, description_he = ?, price = ?,
          image_url = ?, badge_en = ?, badge_he = ?, inventory = ?, active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        input.slug, input.category, input.nameEn, input.nameHe, input.subtitleEn || "",
        input.subtitleHe || "", input.descriptionEn || "", input.descriptionHe || "",
        input.price === "" ? null : Number(input.price), input.imageUrl, input.badgeEn || "",
        input.badgeHe || "", Number(input.inventory || 0), asBoolean(input.active) ? 1 : 0, id
      );
      return this.getProduct(id);
    },
    deleteProduct(id) {
      return db.prepare("DELETE FROM products WHERE id = ?").run(id).changes > 0;
    },
    getCart(cartId) {
      const rows = db.prepare(`
        SELECT c.size, c.quantity, p.*
        FROM cart_items c JOIN products p ON p.id = c.product_id
        WHERE c.cart_id = ? ORDER BY p.id
      `).all(cartId);
      const items = rows.map(row => ({
        product: mapProduct(row),
        size: row.size,
        quantity: row.quantity,
        lineTotal: (row.price || 0) * row.quantity
      }));
      return { items, total: items.reduce((sum, item) => sum + item.lineTotal, 0) };
    },
    addCartItem(cartId, productId, size, quantity) {
      const product = this.getProduct(productId);
      if (!product || !product.active || product.price === null) throw new Error("Product is not available for online purchase.");
      if (product.inventory < quantity) throw new Error("Requested quantity is unavailable.");
      db.prepare(`
        INSERT INTO cart_items (cart_id, product_id, size, quantity)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cart_id, product_id, size)
        DO UPDATE SET quantity = quantity + excluded.quantity
      `).run(cartId, productId, size, quantity);
      return this.getCart(cartId);
    },
    removeCartItem(cartId, productId, size) {
      db.prepare("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ? AND size = ?").run(cartId, productId, size);
      return this.getCart(cartId);
    },
    createOrder(cartId, customer) {
      const cart = this.getCart(cartId);
      if (!cart.items.length) throw new Error("The cart is empty.");
      const orderNumber = `RT-${Date.now().toString(36).toUpperCase()}`;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const item of cart.items) {
          if (item.product.inventory < item.quantity) throw new Error(`${item.product.nameEn} is no longer available in that quantity.`);
          db.prepare("UPDATE products SET inventory = inventory - ? WHERE id = ?").run(item.quantity, item.product.id);
        }
        db.prepare(`
          INSERT INTO orders (order_number, customer_name, email, phone, total, items_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(orderNumber, customer.name, customer.email, customer.phone, cart.total, JSON.stringify(cart.items));
        db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cartId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return { orderNumber, total: cart.total };
    },
    createAppointment(input) {
      return db.prepare(`
        INSERT INTO appointments (name, email, phone, event_date, occasion, consultation_type, message, language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.name, input.email, input.phone, input.eventDate || null, input.occasion || "",
        input.consultationType || "", input.message || "", input.language === "he" ? "he" : "en"
      ).lastInsertRowid;
    },
    listOrders() {
      return db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 100").all();
    },
    listAppointments() {
      return db.prepare("SELECT * FROM appointments ORDER BY id DESC LIMIT 100").all();
    }
  };
}

module.exports = { createDatabase };
