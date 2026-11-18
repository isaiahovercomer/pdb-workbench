const fs = require('node:fs');
const {writeBook, readHeader, createProject, decodeText} = require('./core.cjs');
const [command, ...args] = process.argv.slice(2);
function save(path, data) {
  fs.writeFileSync(path, data, {flag: 'wx'});
  console.log(path);
}
try {
  if (command === 'inspect' && args.length === 1) {
    const file = fs.openSync(args[0], 'r');
    try {
      const header = Buffer.alloc(78);
      const length = fs.readSync(file, header, 0, 78, 0);
      console.log(JSON.stringify(readHeader(Uint8Array.from(header.subarray(0,length)).buffer, fs.fstatSync(file).size),null,2));
    } finally { fs.closeSync(file); }
  } else if (command === 'palmdoc' && args.length >= 3 && args.length <= 4) {
    const [input, output, title, encoding='utf-8'] = args;
    if (!['utf-8','big5'].includes(encoding)) throw Error('輸出編碼可選 utf-8 或 big5');
    const source = decodeText(fs.readFileSync(input), 'auto');
    save(output, writeBook(title, source, encoding, true));
  } else if (command === 'ixl' && args.length >= 4) {
    const [output, title, destination, ...sources] = args;
    save(output, createProject(title, sources.join('\n'), destination, '0', 'include'));
  } else {
    throw Error('用法請見 SKILL.md，可用命令為 palmdoc、inspect、ixl。');
  }
} catch (error) { console.error(error.message); process.exitCode=1; }
