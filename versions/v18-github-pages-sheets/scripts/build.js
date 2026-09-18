const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const site = JSON.parse(fs.readFileSync(path.join(root, "config/site.json"), "utf8"));
const seedProducts = JSON.parse(fs.readFileSync(path.join(root, "config/products.seed.json"), "utf8"));
const template = fs.readFileSync(path.join(root, "views/store.ejs"), "utf8");

const products = seedProducts
  .filter(product => product.active !== false)
  .map((product, index) => ({
    ...product,
    id: index + 1,
    imageUrl: product.imageUrls[0]
  }));

function renderLocale(lang) {
  const isHebrew = lang === "he";
  const outputDirectory = isHebrew ? path.join(dist, "he") : dist;
  const html = ejs.render(template, {
    lang,
    dir: isHebrew ? "rtl" : "ltr",
    site,
    products,
    cart: {items: [], total: 0},
    slots: [],
    text: value => value?.[lang] ?? value?.en ?? "",
    assetPrefix: isHebrew ? "../assets/" : "./assets/",
    homeHref: isHebrew ? "../" : "./",
    languageHref: isHebrew ? "../" : "./he/"
  }, {filename: path.join(root, "views/store.ejs")});

  fs.mkdirSync(outputDirectory, {recursive: true});
  fs.writeFileSync(path.join(outputDirectory, "index.html"), html);
}

fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(dist, {recursive: true});
fs.cpSync(path.join(root, "public"), path.join(dist, "assets"), {recursive: true});
renderLocale("en");
renderLocale("he");
fs.writeFileSync(path.join(dist, ".nojekyll"), "");
fs.copyFileSync(path.join(dist, "index.html"), path.join(dist, "404.html"));

console.log(`Built GitHub Pages site in ${dist}`);
