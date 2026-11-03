// node annotate.js <profile.cpuprofile> <bundle.map> -> writes <profile>.named.json
const fs = require('fs');
const { SourceMapConsumer } = require(require('path').join(__dirname, '../../node_modules/source-map'));
const [,, prof, map] = process.argv;
(async () => {
  const d = JSON.parse(fs.readFileSync(prof, 'utf8'));
  const sm = await new SourceMapConsumer(JSON.parse(fs.readFileSync(map, 'utf8')));
  const cache = new Map();
  for (const [id, f] of Object.entries(d.stackFrames)) {
    if (f.category !== 'JavaScript') continue;
    const addr = Number(f.funcVirtAddr) + Number(f.offset);
    let r = cache.get(addr);
    if (!r) {
      const p = sm.originalPositionFor({ line: 1, column: addr });
      r = p && p.source ? `${(p.source || '').replace(/^.*?Mihrab\//, '')}:${p.line} ${p.name || f.name || ''}` : `?${f.name || ''}`;
      cache.set(addr, r);
    }
    f.named = r;
  }
  fs.writeFileSync(prof.replace(/\.cpuprofile$/, '.named.json'), JSON.stringify(d));
  sm.destroy && sm.destroy();
})();
