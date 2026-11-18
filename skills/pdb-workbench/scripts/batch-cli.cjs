const fs = require('node:fs');
const path = require('node:path');
const reader = require('./reader.cjs');
const {batchBooks} = require('./batch.cjs');
const {zip} = require('./zip.cjs');
function listBooks(inputs) {
  const files = [];
  function collect(item, label) {
    const stat = fs.lstatSync(item);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(item).sort()) collect(path.join(item,name),label+'/'+name);
    } else if (stat.isFile() && /\.(pdb|prc)$/i.test(item)) {
      files.push({path:item,name:label, size:stat.size, load:()=>fs.promises.readFile(item)});
    }
  }
  for (const item of inputs) collect(item,path.basename(path.resolve(item)));
  if (!files.length) throw Error('找不到 PDB 或 PRC 檔案。');
  return files;
}
async function batch(output,inputs,encoding){
  const files=listBooks(inputs);
  const result = await batchBooks(files,reader,encoding,(_n,_total,line)=>console.log(line));
  const blob = zip(result.entries,'application/zip');
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.promises.writeFile(output,buffer,{flag:'wx'});
  console.log(result.summary,output);
  if (result.succeeded < files.length) process.exitCode=2;
}
module.exports={batch,listBooks};
