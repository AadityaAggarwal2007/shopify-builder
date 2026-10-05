// Transpiles one src .ts file to CommonJS inside scripts/tests/.build so `require` finds node_modules.
const fs = require('fs'), path = require('path');
const ts = require('typescript');
const out = path.join(__dirname, '.build');
fs.mkdirSync(out, { recursive: true });
function load(rel) {
  const src = path.resolve(__dirname, '../../src', rel + '.ts');
  const js = ts.transpileModule(fs.readFileSync(src, 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2020', esModuleInterop: true } }).outputText;
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
