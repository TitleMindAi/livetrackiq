import fs from 'fs';
import * as acorn from 'acorn';
import jsxDefault from 'acorn-jsx';
const Parser = acorn.Parser.extend(jsxDefault());
let bad = 0;
for (const f of process.argv.slice(2)) {
  try {
    Parser.parse(fs.readFileSync(f,'utf8'), { sourceType:'module', ecmaVersion:'latest' });
    console.log('OK  ', f);
  } catch(e) {
    console.log('FAIL', f, '-', e.message);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
