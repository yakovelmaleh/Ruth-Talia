const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function asBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
}

function minutes(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function timeKey(totalMinutes) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function localDateTimeKey(date) {
  return `${localDateKey(date)}T${timeKey(date.getHours() * 60 + date.getMinutes())}`;
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
      images_json TEXT NOT NULL DEFAULT '[]',
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
      slot_id INTEGER UNIQUE REFERENCES availability_slots(id) ON DELETE SET NULL,
      language TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS availability_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      starts_at TEXT NOT NULL UNIQUE,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      location TEXT NOT NULL DEFAULT 'atelier',
      active INTEGER NOT NULL DEFAULT 1,
      close_reason TEXT NOT NULL DEFAULT '',
      booked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const slotColumns = db.prepare("PRAGMA table_info(availability_slots)").all();
  if (!slotColumns.some(column => column.name === "close_reason")) {
    db.exec("ALTER TABLE availability_slots ADD COLUMN close_reason TEXT NOT NULL DEFAULT ''");
  }

  const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  if (productCount === 0) {
    const seeds = JSON.parse(fs.readFileSync(path.join(rootDir, "config", "products.seed.json"), "utf8"));
    const insert = db.prepare(`
      INSERT INTO products (
        slug, category, name_en, name_he, subtitle_en, subtitle_he,
        description_en, description_he, price, image_url, images_json,
        badge_en, badge_he, inventory, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of seeds) {
      insert.run(
        item.slug, item.category, item.nameEn, item.nameHe, item.subtitleEn,
        item.subtitleHe, item.descriptionEn, item.descriptionHe, item.price,
        item.imageUrls[0], JSON.stringify(item.imageUrls), item.badgeEn, item.badgeHe,
        item.inventory, item.active ? 1 : 0
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
    imageUrls: (() => {
      try {
        const images = JSON.parse(row.images_json || "[]");
        return images.length ? images : [row.image_url];
      } catch {
        return [row.image_url];
      }
    })(),
    badgeEn: row.badge_en,
    badgeHe: row.badge_he,
    inventory: row.inventory,
    active: Boolean(row.active)
  });

  const imageUrls = input => {
    const values = String(input.imageUrls || input.imageUrl || "")
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean);
    if (values.length < 2) {
      const error = new Error("Every product requires at least two image URLs.");
      error.status = 400;
      throw error;
    }
    return values;
  };

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
          description_en, description_he, price, image_url, images_json,
          badge_en, badge_he, inventory, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.slug, input.category, input.nameEn, input.nameHe, input.subtitleEn || "",
        input.subtitleHe || "", input.descriptionEn || "", input.descriptionHe || "",
        input.price === "" ? null : Number(input.price), imageUrls(input)[0],
        JSON.stringify(imageUrls(input)), input.badgeEn || "", input.badgeHe || "",
        Number(input.inventory || 0), asBoolean(input.active) ? 1 : 0
      );
      return this.getProduct(result.lastInsertRowid);
    },
    updateProduct(id, input) {
      db.prepare(`
        UPDATE products SET
          slug = ?, category = ?, name_en = ?, name_he = ?, subtitle_en = ?,
          subtitle_he = ?, description_en = ?, description_he = ?, price = ?,
          image_url = ?, images_json = ?, badge_en = ?, badge_he = ?, inventory = ?, active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        input.slug, input.category, input.nameEn, input.nameHe, input.subtitleEn || "",
        input.subtitleHe || "", input.descriptionEn || "", input.descriptionHe || "",
        input.price === "" ? null : Number(input.price), imageUrls(input)[0],
        JSON.stringify(imageUrls(input)), input.badgeEn || "", input.badgeHe || "",
        Number(input.inventory || 0), asBoolean(input.active) ? 1 : 0, id
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
      const slotId = Number(input.slotId);
      if (!Number.isInteger(slotId) || slotId <= 0) {
        const error = new Error("Please choose one of Ruth's available appointment slots.");
        error.status = 400;
        throw error;
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        const slot = db.prepare("SELECT * FROM availability_slots WHERE id = ? AND active = 1 AND booked_at IS NULL").get(slotId);
        if (!slot) {
          const error = new Error("That appointment slot is no longer available.");
          error.status = 409;
          throw error;
        }
        const result = db.prepare(`
          INSERT INTO appointments (name, email, phone, event_date, occasion, consultation_type, message, slot_id, language)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.name, input.email, input.phone, slot.starts_at.slice(0, 10), input.occasion || "",
          input.consultationType || "", input.message || "", slotId, input.language === "he" ? "he" : "en"
        );
        db.prepare("UPDATE availability_slots SET booked_at = CURRENT_TIMESTAMP WHERE id = ?").run(slotId);
        db.exec("COMMIT");
        return { id: Number(result.lastInsertRowid), slotStartsAt: slot?.starts_at || null };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    listAvailableSlots() {
      return db.prepare(`
        SELECT * FROM availability_slots
        WHERE active = 1 AND booked_at IS NULL AND starts_at >= ?
        ORDER BY starts_at LIMIT 700
      `).all(localDateTimeKey(new Date()));
    },
    listSlots({ from = "", to = "", status = "all", limit = 40 } = {}) {
      const conditions = ["starts_at >= ?"];
      const values = [from ? `${from}T00:00` : localDateTimeKey(new Date())];
      if (to) {
        conditions.push("starts_at < ?");
        const nextDay = new Date(`${to}T12:00:00`);
        nextDay.setDate(nextDay.getDate() + 1);
        values.push(`${localDateKey(nextDay)}T00:00`);
      }
      if (status === "open") conditions.push("active = 1 AND booked_at IS NULL");
      if (status === "closed") conditions.push("active = 0 AND booked_at IS NULL");
      if (status === "booked") conditions.push("booked_at IS NOT NULL");
      values.push(Math.max(1, Math.min(300, Number(limit) || 40)));
      return db.prepare(`
        SELECT * FROM availability_slots
        WHERE ${conditions.join(" AND ")}
        ORDER BY starts_at ASC LIMIT ?
      `).all(...values);
    },
    ensureDefaultSlots(config, fromDate = new Date()) {
      const duration = Number(config.defaultDurationMinutes || 60);
      if (duration !== 60) throw new Error("Default appointment duration must be 60 minutes.");
      const workingDays = new Set(config.workingDays || [0, 1, 2, 3, 4]);
      if (workingDays.has(5) || workingDays.has(6)) throw new Error("Friday and Saturday cannot be working days.");
      const start = minutes(config.startTime || "10:00");
      const end = minutes(config.endTime || "18:00");
      const breakStart = minutes(config.breakStart || "13:00");
      const breakEnd = minutes(config.breakEnd || "14:00");
      const daysAhead = Number(config.weeksAhead || 12) * 7;
      const insert = db.prepare(`
        INSERT OR IGNORE INTO availability_slots (starts_at, duration_minutes, location)
        VALUES (?, 60, ?)
      `);
      let created = 0;
      for (let offset = 0; offset < daysAhead; offset += 1) {
        const date = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + offset);
        if (!workingDays.has(date.getDay())) continue;
        for (let current = start; current + duration <= end; current += duration) {
          const overlapsBreak = current < breakEnd && current + duration > breakStart;
          if (overlapsBreak) continue;
          created += Number(insert.run(
            `${localDateKey(date)}T${timeKey(current)}`,
            config.defaultLocation || "atelier"
          ).changes);
        }
      }
      return created;
    },
    createSlot(input) {
      const startsAt = `${input.date}T${input.time}`;
      if (Number.isNaN(Date.parse(startsAt)) || new Date(startsAt) <= new Date()) {
        throw new Error("Availability slots must be valid future dates.");
      }
      const duration = Number(input.durationMinutes || 60);
      if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
        throw new Error("Slot duration must be between 15 and 480 minutes.");
      }
      return db.prepare(`
        INSERT INTO availability_slots (starts_at, duration_minutes, location)
        VALUES (?, ?, ?)
      `).run(startsAt, duration, input.location || "atelier").lastInsertRowid;
    },
    deleteSlot(id) {
      const slot = db.prepare("SELECT booked_at FROM availability_slots WHERE id = ?").get(id);
      if (!slot) return false;
      if (slot.booked_at) throw new Error("A booked slot cannot be deleted.");
      return db.prepare("DELETE FROM availability_slots WHERE id = ?").run(id).changes > 0;
    },
    toggleSlot(id, reason = "") {
      const slot = db.prepare("SELECT active, booked_at FROM availability_slots WHERE id = ?").get(id);
      if (!slot) return false;
      if (slot.booked_at) throw new Error("A booked slot cannot be changed.");
      const normalizedReason = String(reason || "").trim();
      if (slot.active && !normalizedReason) {
        const error = new Error("Please add the reason this appointment time is being closed.");
        error.status = 400;
        throw error;
      }
      db.prepare("UPDATE availability_slots SET active = ?, close_reason = ? WHERE id = ?")
        .run(slot.active ? 0 : 1, slot.active ? normalizedReason : "", id);
      return true;
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
