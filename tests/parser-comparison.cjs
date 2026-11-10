const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js','utf8');
const worker = fs.readFileSync('worker-v280.js','utf8');

function between(source, start, end) {
  const a = source.indexOf(start);
  if (a < 0) throw new Error('Function not found: ' + start);
  const b = source.indexOf(end, a);
  if (b < 0) throw new Error('End marker not found: ' + end);
  return source.slice(a, b).trim();
}
const appFn = between(app, 'function parseRSSFull(', 'function extractGemeenteDate(');
const workerFn = between(worker, 'function parseRSS(', 'function parseRTVVechtdal(');
const appContext = { MAX_PER_BRON: {'De Stentor':25,'RondOmmen':20,'Ommen City':10,'OudOmmen':10,'Vechtdal Centraal':10,'Nieuwsbrief':10,'Natuurlijk Ommen':10,'Gemeente Ommen':10,'RTV Oost':10,'RTV Vechtdal':10} };
vm.createContext(appContext);
vm.runInContext(appFn + '\nthis.parse = parseRSSFull;', appContext);
const workerContext = {
  extractRssDate: (item) => {
    const raw = (item.match(/<(pubDate|published|updated)[^>]*>([\\s\\S]*?)<\\/(pubDate|published|updated)>/i)||[])[2]||'';
    const d = raw ? new Date(raw) : null;
    return d && !isNaN(d.getTime()) ? d.toISOString() : null;
  }
};
vm.createContext(workerContext);
vm.runInContext(workerFn + '\nthis.parse = parseRSS;', workerContext);

const fixture = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item><title><![CDATA[Ommen testbericht]]></title><link>https://example.test/ommen-1</link><pubDate>Tue, 10 Nov 2026 09:15:00 +0100</pubDate><description><![CDATA[Bericht over Ommen.]]></description></item>
<item><title>Regio testbericht</title><link>https://example.test/regio-2</link><pubDate>Tue, 10 Nov 2026 08:05:00 GMT</pubDate><description>Bericht over de regio.</description></item>
</channel></rss>`;
const appOut = appContext.parse(fixture, 'De Stentor');
const workerOut = workerContext.parse(fixture, 'De Stentor');
const norm = rows => rows.map(x => ({
  title: x.title, link: x.link,
  pubDate: x.pubDate instanceof Date ? x.pubDate.toISOString() : (x.pubDate || null),
  description: x.description || null
}));
const left = norm(appOut), right = norm(workerOut);
console.log('APP parser output:', JSON.stringify(left));
console.log('WORKER parser output:', JSON.stringify(right));
console.log('Same article count:', left.length === right.length);
console.log('Same normalized output:', JSON.stringify(left) === JSON.stringify(right));
if (JSON.stringify(left) === JSON.stringify(right)) process.exit(1);
