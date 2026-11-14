// Tells IndexNow search engines (Bing, Yandex and others) which pages to look at. Google does not use IndexNow.
// The page list comes from build/sitemap.xml; the key is the name of the one static/<key>.txt file.
// The key is public by design: the same text is served at https://<site>/<key>.txt so the engines can check the site is ours.
//
// Run it AFTER the site is deployed (the key file must already be live):
//   npm run build && firebase deploy --only hosting && node scripts/indexnow.mjs
// Use --dry-run to print what would be sent without sending anything.
import { readFileSync, readdirSync } from 'node:fs';

const dry = process.argv.includes('--dry-run');
const fail = (msg) => { console.error(`indexnow: ${msg}`); process.exit(1); };

let sitemap;
try { sitemap = readFileSync(new URL('../build/sitemap.xml', import.meta.url), 'utf8'); } catch { fail('build/sitemap.xml not found. Run "npm run build" first.'); }
const all = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
if (!all.length) fail('no URLs found in build/sitemap.xml');
const host = new URL(all[0]).host;
const urlList = all.filter((u) => new URL(u).host === host);   // IndexNow only accepts URLs on the key's own host

const keyFiles = readdirSync(new URL('../static/', import.meta.url)).filter((f) => /^[A-Za-z0-9-]{8,128}\.txt$/.test(f) && f !== 'robots.txt');
if (keyFiles.length !== 1) fail(`expected exactly one key file in static/, found ${keyFiles.length}`);
const key = keyFiles[0].slice(0, -'.txt'.length);
if (readFileSync(new URL(`../static/${keyFiles[0]}`, import.meta.url), 'utf8').trim() !== key) fail(`static/${keyFiles[0]} must contain exactly the key`);

const body = { host, key, keyLocation: `https://${host}/${key}.txt`, urlList };
if (dry) {
  console.log(JSON.stringify({ host, key, keyLocation: body.keyLocation, count: urlList.length, first: urlList[0], last: urlList[urlList.length - 1] }));
  process.exit(0);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body)
});
console.log(`indexnow: submitted ${urlList.length} URLs for ${host}, responded HTTP ${res.status}`);
// 200 and 202 both mean accepted. 202 means the key check is still pending, which is normal right after a deploy.
if (!res.ok) fail(`unexpected response ${res.status}`);
