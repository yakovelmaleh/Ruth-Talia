const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDatabase } = require("../src/database");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rt-store-"));
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config", "products.seed.json"), JSON.stringify([{
    slug: "test-dress", category: "evening", nameEn: "Test Dress", nameHe: "שמלת בדיקה",
    subtitleEn: "", subtitleHe: "", descriptionEn: "", descriptionHe: "", price: 1000,
    imageUrl: "https://example.com/dress.jpg", badgeEn: "", badgeHe: "", inventory: 2, active: true
  }]));
  return { root, clean: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("persists products, cart, orders, and appointments", () => {
  const { root, clean } = fixture();
  try {
    const store = createDatabase(root);
    const [product] = store.listProducts();
    assert.equal(product.nameEn, "Test Dress");
    const cart = store.addCartItem("cart-1", product.id, "38", 1);
    assert.equal(cart.total, 1000);
    const order = store.createOrder("cart-1", { name: "Ruth", email: "r@example.com", phone: "050" });
    assert.match(order.orderNumber, /^RT-/);
    assert.equal(store.getCart("cart-1").items.length, 0);
    assert.equal(store.listOrders().length, 1);
    store.createAppointment({ name: "Talia", email: "t@example.com", phone: "051", language: "he" });
    assert.equal(store.listAppointments().length, 1);
  } finally {
    clean();
  }
});
