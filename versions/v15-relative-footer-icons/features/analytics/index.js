const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, separator)), decodeURIComponent(part.slice(separator + 1))];
  }));
}

function clean(value, fallback, maxLength = 120) {
  return String(value || fallback).trim().slice(0, maxLength) || fallback;
}

function sourceFrom(referrer) {
  if (!referrer) return "Direct";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "") || "Direct";
  } catch {
    return "Unknown";
  }
}

function deviceFrom(width, userAgent) {
  const numericWidth = Number(width);
  if (/ipad|tablet/i.test(userAgent) || (numericWidth >= 700 && numericWidth < 1100)) return "tablet";
  if (/mobile|iphone|android/i.test(userAgent) || (numericWidth > 0 && numericWidth < 700)) return "mobile";
  return "desktop";
}

function createAnalyticsFeature(rootDir) {
  const dataDir = path.join(rootDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "analytics.sqlite"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      path TEXT NOT NULL,
      language TEXT NOT NULL,
      device TEXT NOT NULL,
      source TEXT NOT NULL,
      country TEXT NOT NULL,
      timezone TEXT NOT NULL,
      screen_width INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_visits_date ON analytics_visits(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_visits_visitor ON analytics_visits(visitor_id);
  `);

  const router = express.Router();
  function recordVisit(input) {
    db.prepare(`
      INSERT INTO analytics_visits (
        visitor_id, path, language, device, source, country, timezone, screen_width
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.visitorId,
      clean(input.path, "/", 200),
      input.language === "he" ? "he" : "en",
      deviceFrom(input.screenWidth, input.userAgent || ""),
      sourceFrom(input.referrer),
      clean(input.country, "Unknown", 40),
      clean(input.timezone, "Unknown", 80),
      Math.max(0, Math.min(10000, Number(input.screenWidth) || 0))
    );
  }

  router.post("/visit", (req, res) => {
    const userAgent = String(req.headers["user-agent"] || "");
    if (/bot|crawler|spider|preview/i.test(userAgent)) return res.status(204).end();
    const cookies = parseCookies(req.headers.cookie);
    const visitorId = cookies.rt_visitor || crypto.randomUUID();
    if (!cookies.rt_visitor) {
      res.cookie("rt_visitor", visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 365
      });
    }
    const country = clean(
      req.headers["x-vercel-ip-country"] || req.headers["cf-ipcountry"] || req.headers["x-country-code"],
      "Unknown",
      40
    );
    recordVisit({
      visitorId,
      path: req.body.path,
      language: req.body.language,
      screenWidth: req.body.screenWidth,
      userAgent,
      referrer: req.body.referrer,
      country,
      timezone: req.body.timezone
    });
    res.status(204).end();
  });

  function dashboard(filters = {}) {
    const today = new Date();
    const defaultFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(filters.from || "") ? filters.from : dateKey(defaultFrom);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(filters.to || "") ? filters.to : dateKey(today);
    const device = ["mobile", "tablet", "desktop"].includes(filters.device) ? filters.device : "all";
    const conditions = ["date(occurred_at) BETWEEN ? AND ?"];
    const values = [from, to];
    if (device !== "all") {
      conditions.push("device = ?");
      values.push(device);
    }
    const where = conditions.join(" AND ");
    const totals = db.prepare(`
      SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
      FROM analytics_visits WHERE ${where}
    `).get(...values);
    const grouped = column => db.prepare(`
      SELECT ${column} AS label, COUNT(*) AS value
      FROM analytics_visits WHERE ${where}
      GROUP BY ${column} ORDER BY value DESC LIMIT 12
    `).all(...values);
    const daily = db.prepare(`
      SELECT date(occurred_at) AS label, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
      FROM analytics_visits WHERE ${where}
      GROUP BY date(occurred_at) ORDER BY label
    `).all(...values);
    return {
      filters: { from, to, device },
      totals,
      daily,
      devices: grouped("device"),
      sources: grouped("source"),
      countries: grouped("country")
    };
  }

  return { router, dashboard, recordVisit };
}

module.exports = { createAnalyticsFeature };
