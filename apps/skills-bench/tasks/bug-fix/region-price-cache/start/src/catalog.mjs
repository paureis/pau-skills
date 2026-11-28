// The products and the regions the shop sells in. Net prices are whole cents in each region's own currency.
// In production the catalog is a remote service and every read is slow, so reads are counted.
export const REGIONS = new Map([
  ['us', { name: 'United States', currency: 'USD', taxBasisPoints: 0 }],
  ['eu', { name: 'Europe', currency: 'EUR', taxBasisPoints: 2000 }],
  ['uk', { name: 'United Kingdom', currency: 'GBP', taxBasisPoints: 2000 }],
]);

const PRODUCTS = new Map([
  ['lamp', { name: 'Desk lamp', prices: new Map([['us', 3900], ['eu', 3500], ['uk', 3100]]) }],
  ['mug', { name: 'Stoneware mug', prices: new Map([['us', 1200], ['eu', 1100], ['uk', 950]]) }],
  ['tote', { name: 'Canvas tote', prices: new Map([['us', 1800], ['eu', 1650], ['uk', 1400]]) }],
  ['notebook', { name: 'Dot grid notebook', prices: new Map([['us', 1499], ['eu', 1299], ['uk', 1150]]) }],
]);

let reads = 0;

export function regionOf(code) {
  if (!REGIONS.has(code)) throw new Error(`unknown region: ${code} (${[...REGIONS.keys()].join(', ')})`);
  return REGIONS.get(code);
}

export function productCodes() {
  return [...PRODUCTS.keys()];
}

/** One catalog read: a product's name and net price in a region, with the region's currency and tax rate. */
export function readCatalog(sku, regionCode) {
  reads++;
  if (!PRODUCTS.has(sku)) throw new Error(`unknown product: ${sku}`);
  const product = PRODUCTS.get(sku);
  const region = regionOf(regionCode);
  return { sku, name: product.name, netCents: product.prices.get(regionCode), currency: region.currency, taxBasisPoints: region.taxBasisPoints };
}

export function catalogReads() {
  return reads;
}
