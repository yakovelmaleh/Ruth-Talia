const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {execFileSync} = require("node:child_process");

const root = path.resolve(__dirname, "..");

test("build creates deployable English and Hebrew pages", () => {
  execFileSync(process.execPath, ["scripts/build.js"], {cwd: root});
  const english = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
  const hebrew = fs.readFileSync(path.join(root, "dist/he/index.html"), "utf8");

  assert.match(english, /<html lang="en" dir="ltr">/);
  assert.match(hebrew, /<html lang="he" dir="rtl">/);
  assert.match(english, /src="\.\/assets\/api\.js"/);
  assert.match(hebrew, /src="\.\.\/assets\/api\.js"/);
  assert.doesNotMatch(english, /<%[=-]?/);
  assert.doesNotMatch(hebrew, /<%[=-]?/);
});

test("deployment contains no credentials or customer database", () => {
  execFileSync(process.execPath, ["scripts/build.js"], {cwd: root});
  const runtime = fs.readFileSync(path.join(root, "dist/assets/runtime-config.js"), "utf8");
  const files = fs.readdirSync(path.join(root, "dist/assets"));

  assert.match(runtime, /apiUrl:\s*""/);
  assert.ok(!files.some(file => /\.sqlite|\.env/i.test(file)));
});

test("Apps Script implements the required API and concurrency controls", () => {
  const script = fs.readFileSync(path.join(root, "google-apps-script/Code.gs"), "utf8");

  for (const symbol of ["doGet", "doPost", "createOrder_", "createAppointment_", "LockService", "validateHumanRequest_", "requestStatus_"]) {
    assert.match(script, new RegExp(`\\b${symbol}\\b`));
  }
  assert.match(script, /BOOKED/);
  assert.match(script, /requestId/);
  assert.match(script, /MimeType\.JAVASCRIPT/);
});
