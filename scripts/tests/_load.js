// Transpiles one src .ts file to CommonJS inside scripts/tests/.build so `require` finds node_modules.
const fs = require('fs'), path = require('path');
const ts = require('typescript');
const out = path.join(__dirname, '.build');
fs.mkdirSync(out, { recursive: true });
function load(rel) {
  const src = path.resolve(__dirname, '../../src', rel + '.ts');
  let js = ts.transpileModule(fs.readFileSync(src, 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2020', esModuleInterop: true } }).outputText;
  // A relative require of another src file: build that one too and point at its flattened copy.
  js = js.replace(/require\("(\.{1,2}\/[^"]+)"\)/g, (m, r) => {
    const target = path.relative(path.resolve(__dirname, '../../src'), path.resolve(path.dirname(src), r)).replace(/\\/g, '/');
    if (!fs.existsSync(path.resolve(__dirname, '../../src', target + '.ts'))) return m;
    load(target);
    return `require("./${target.replace(/[\\/]/g, '__')}")`;
  });
  const file = path.join(out, rel.replace(/[\\/]/g, '__') + '.js');
  fs.writeFileSync(file, js);
  return require(file);
}
let n = 0;
function t(name, fn) {
  try { fn(); } catch (e) { e.message = `${name}: ${e.message}`; throw e; }
  n++;
}
async function ta(name, fn) {
  try { await fn(); } catch (e) { e.message = `${name}: ${e.message}`; throw e; }
  n++;
}
const done = (suite) => console.log(`${suite}: ${n} checks passed`);
module.exports = { load, t, ta, done };
