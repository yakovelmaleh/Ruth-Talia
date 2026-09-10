const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDatabase } = require("../src/database");
const { createEmailService } = require("../src/email");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rt-store-"));
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config", "products.seed.json"), JSON.stringify([{
    slug: "test-dress", category: "evening", nameEn: "Test Dress", nameHe: "שמלת בדיקה",
    subtitleEn: "", subtitleHe: "", descriptionEn: "", descriptionHe: "", price: 1000,
    imageUrls: ["https://example.com/dress.jpg", "https://example.com/dress-2.jpg"], badgeEn: "", badgeHe: "", inventory: 2, active: true
  }]));
  return { root, clean: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("persists products, cart, orders, and appointments", () => {
  const { root, clean } = fixture();
  try {
    const store = createDatabase(root);
    const [product] = store.listProducts();
    assert.equal(product.nameEn, "Test Dress");
    assert.equal(product.imageUrls.length, 2);
    const cart = store.addCartItem("cart-1", product.id, "38", 1);
    assert.equal(cart.total, 1000);
    const order = store.createOrder("cart-1", { name: "Ruth", email: "r@example.com", phone: "050" });
    assert.match(order.orderNumber, /^RT-/);
    assert.equal(store.getCart("cart-1").items.length, 0);
    assert.equal(store.listOrders().length, 1);
    const slotId = store.createSlot({date:"2099-01-02", time:"10:30", durationMinutes:60, location:"atelier"});
    assert.equal(store.listAvailableSlots().length, 1);
    store.createAppointment({ name: "Talia", email: "t@example.com", phone: "051", language: "he", slotId });
    assert.equal(store.listAppointments().length, 1);
    assert.equal(store.listAvailableSlots().length, 0);
  } finally {
    clean();
  }
});

test("reports unconfigured email instead of pretending delivery succeeded", async () => {
  const service = createEmailService({calendar:{timeZone:"Asia/Jerusalem"}});
  assert.equal(service.configured, false);
  const result = await service.sendAppointment({});
  assert.equal(result.delivered, false);
  assert.match(result.reason, /not configured/i);
});

test("requires at least two product images", () => {
  const { root, clean } = fixture();
  try {
    const store = createDatabase(root);
    assert.throws(() => store.createProduct({
      slug: "one-image", category: "evening", nameEn: "One", nameHe: "אחת",
      imageUrls: "https://example.com/only.jpg", inventory: 1, active: true
    }), /at least two/i);
  } finally {
    clean();
  }
});

test("appointments require one of Ruth's available slots", () => {
  const { root, clean } = fixture();
  try {
    const store = createDatabase(root);
    assert.throws(() => store.createAppointment({
      name: "No Slot", email: "none@example.com", phone: "050", language: "en"
    }), /available appointment slots/i);
  } finally {
    clean();
  }
});
