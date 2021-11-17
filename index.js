const axios = require("axios");
const cheerio = require("cheerio");
const slugify = require("slugify");
const { Parser } = require("json2csv");
const fs = require("fs");
const dayjs = require("dayjs");
const cliProgress = require("cli-progress");
const puppeteer = require("puppeteer");

const json2csvParser = new Parser();
const json2csvParser2 = new Parser();

const bar1 = new cliProgress.SingleBar(
  { format: "progress [{bar}] {percentage}%" },
  cliProgress.Presets.shades_classic
);
const url = "https://www.ikea.com/pl/pl/cat/oswietlenie-li001/";

let progress = 0;
let categoriesLength = 0;

const productsArr = [];

const exactProduct = ($, categoryId) => {
  const name = $(".range-revamp-header-section__title--big").map(
    (index, category) => $(category).text()
  )[0];
  const id = +$(".range-revamp-product-summary span")
    .map((index, id) => $(id).text())[2]
    .split(".")
    .join("");
  const price = +$(
    ".range-revamp-product__subgrid.product-pip.js-product-pip"
  ).map((index, price) => $(price).attr("data-product-price"))[0];
  const summary = $(
    ".js-price-package.range-revamp-pip-price-package .range-revamp-header-section__description-text"
  ).map((index, summ) => $(summ).text())[0];
  const description = $(".range-revamp-product-summary__description").map(
    (index, desc) => $(desc).text()
  )[0];

  const images = $(
    ".range-revamp-product__left-top .range-revamp-media-grid__media-container"
  )
    .map((index, image) => $(image).find("img").attr("src"))
    .toArray()
    .toString();

  const productObj = {
    ID: id,
    "Active (0/1)": 1,
    Name: name,
    Category: categoryId,
    "Price tax excluded": price,
    "Tax rules ID": 1,
    "Wholesale price": price,
    "On sale (0/1)": 0,
    "Discount amount": 0,
    "Discount percent": 0,
    "Discount from (yyyy-mm-dd)": dayjs().format("YYYY-MM-DD"),
    "Discount to (yyyy-mm-dd)": dayjs().format("YYYY-MM-DD"),
    Reference: id,
    "Supplier reference": id,
    Supplier: "IKEA",
    Manufacturer: "IKEA",
    EAN13: "1234",
    UPC: "",
    MPN: "",
    Ecotax: 0,
    Width: 0.3,
    Height: 0.3,
    Depth: 1,
    Weight: 0.5,
    "Delivery time of in-stock products": "",
    "Delivery time of out-of-stock products with allowed orders": "",
    Quantity: 10000,
    "Minimal quantity": 1,
    "Low stock level": 2,
    "Send me an email when the quantity is under this level": 0,
    Visibility: "",
    "Additional shipping cost": 0,
    Unity: 0,
    "Unit price": 0,
    Summary: summary,
    Description: description,
    "Tags (x,y,z...)": "",
    "Meta title": `Meta title-${name}`,
    "Meta keywords": `Meta keywords-${name}`,
    "Meta description": `Meta description-${name}`,
    "URL rewritten": `${slugify(name)}-${id}`,
    "Text when in stock": "In Stock",
    "Text when backorder allowed": "Current supply. Ordering availlable",
    "Available for order (0 = No, 1 = Yes)": 1,
    "Product available date": dayjs().add(2, "year").format("YYYY-MM-DD"),
    "Product creation date": dayjs().format("YYYY-MM-DD"),
    "Show price (0 = No, 1 = Yes)": 1,
    "Image URLs (x,y,z...)": images,
    "Image alt texts (x,y,z...)": "",
    "Delete existing images (0 = No, 1 = Yes)": 0,
    "Feature(Name:Value:Position)": "",
    "Available online only (0 = No, 1 = Yes)": 0,
    Condition: "new",
    "Customizable (0 = No, 1 = Yes)": 0,
    "Uploadable files (0 = No, 1 = Yes)": 0,
    "Text fields (0 = No, 1 = Yes)": 0,
    "Out of stock action": 0,
    "Virtual product": 0,
    "File URL": "",
    "Number of allowed downloads": "",
    "Expiration date": "",
    "Number of days": "",
    "ID / Name of shop": 0,
    "Advanced stock management": 0,
    "Depends On Stock": 0,
    Warehouse: 0,
    "Acessories  (x,y,z...)": "",
  };
  productsArr.push(productObj);
};

const getProductData = async (url, categoryId, productsLength) => {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  exactProduct($, categoryId);

  progress += 197 / (productsLength * categoriesLength);
  bar1.update(progress);
};

const getCategoryDescription = ($) =>
  $(".plp-range-introduction-slot-wrapper p").map((index, category) =>
    $(category).text()
  )[0];

const extractProducts = async ($, categoryId) => {
  const arr = [
    ...new Set(
      $(".plp-fragment-wrapper")
        .map((_, product) => {
          const $product = $(product);
          return $product.find("a").attr("href");
        })
        .toArray()
    ),
  ];
  await Promise.all(
    arr.map(async (url) => getProductData(url, categoryId, arr.length))
  );
};

const extractCategories = ($) => [
  ...new Set(
    $(".plp-navigation-slot-wrapper nav a")
      .map((index, category) => {
        const $category = $(category);
        const title = $category.find(".vn__nav__title").text();
        return {
          ID: index + 1000,
          "Active (0/1)": 1,
          Name: title,
          "Parent category": "Home",
          "Root category (0/1)": 0,
          Description: "",
          "Meta title": `Meta title-${title}`,
          "Meta keywords": `Meta keywords-${title}`,
          "Meta description": `Meta description-${title}`,
          "URL rewritten": slugify(title).toLowerCase(),
          "Image URL": $category.find("img").attr("src"),
          url: $category.attr("href"),
        };
      })
      .toArray()
  ),
];

const getProductsOnPage = async (category) => {
  const browser = await puppeteer.launch();
  const [page] = await browser.pages();

  await page.goto(`${category.url}?page=5`, { waitUntil: "networkidle0" });
  const data = await page.evaluate(() => document.querySelector("*").outerHTML);
  await browser.close();
  const $ = cheerio.load(data); // Initialize cheerio
  const description = getCategoryDescription($);
  await extractProducts($, category.Name);
  return {
    ...category,
    Description: description,
  };
};

const saveToFile = async (name, data) =>
  fs.writeFile(name, data, function (err) {
    if (err) throw err;
  });

const init = async () => {
  bar1.start(200, 0);
  const { data } = await axios.get(url);
  bar1.update(3);
  const $ = cheerio.load(data); // Initialize cheerio
  const categories = extractCategories($);
  categoriesLength = categories.length;
  try {
    const categoriesWithDescription = await Promise.all(
      categories.map(async (category) => getProductsOnPage(category))
    );
    const parsedCategories = json2csvParser.parse(categoriesWithDescription);
    const parsedProducts = json2csvParser2.parse(productsArr);
    await saveToFile("categories.csv", parsedCategories);
    await saveToFile("products.csv", parsedProducts);
  } catch (e) {
    console.log(e);
  }

  bar1.stop();
  console.log("Done! Now you can import it to PrestaShop.");
};

init();
