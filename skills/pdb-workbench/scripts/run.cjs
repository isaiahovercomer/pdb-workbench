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
  } else if (command === 'txt' && (args.length === 2 || args.length === 3)) {
    const [input, output, encoding='auto'] = args;
    const reader = require('./reader.cjs');
    if (!['auto','utf-8','big5','gb18030','windows-1252'].includes(encoding)) throw Error('不支援的文字編碼');
    if (fs.statSync(input).size > reader.maxBytes) throw Error('檔案上限為 48 MiB。');
    const bytes = fs.readFileSync(input);
    save(output, require('./batch.cjs').bookText(reader,bytes,encoding));
  } else if (['batch-txt','batch-html','batch-epub'].includes(command) && args.length >= 2) {
    require('./batch-cli.cjs').batch(args[0],args.slice(1),'auto',command.slice(6)).catch(error=>{
      console.error(error.message); process.exitCode=1;
    });
  } else if (command === 'palmdoc' && args.length >= 3 && args.length <= 4) {
    const [input, output, title, encoding='utf-8'] = args;
    if (!['utf-8','big5'].includes(encoding)) throw Error('輸出編碼可選 utf-8 或 big5');
    const source = decodeText(fs.readFileSync(input), 'auto');
    save(output, writeBook(title, source, encoding, true));
  } else if (command === 'export' && args.length>=2 && args.length<=3) {
    require('./export.cjs').exportBook(args[0],args[1],Number(args[2]||0)).catch(error=>{console.error(error.message);process.exitCode=1});
  } else if(command==='plucker'&&args.length>=2&&args.length<=6){
    const [input,output,cover='',side='160',bits='4',mode='zlib']=args;
    if(!['160','240','320'].includes(side)||!['1','2','4'].includes(bits)||!['zlib','raw'].includes(mode))throw Error('尺寸可選 160、240、320，色深可選 1、2、4，壓縮可選 zlib 或 raw。');
    const bitmap=cover&&cover!=='-'?require('./png-cover.cjs').pngCover(cover,+side,+bits):null;
    const book=require('./export.cjs').sourceBook(input);
    require('./plucker.cjs').pluckerBook(book,{bitmap,compress:mode==='zlib'}).then(data=>save(output,data)).catch(e=>{console.error(e.message);process.exitCode=1});
  } else if(command==='search'&&args.length>=2&&args[0].trim()){
    const reader=require('./reader.cjs'),{searchFile}=require('./search.cjs');
    const results=[],errors=[];
    for(const file of require('./batch-cli.cjs').listBooks(args.slice(1))){
      try{
        if(file.size>reader.maxBytes)throw Error('檔案超出 48 MiB');
        const hits=searchFile(reader,fs.readFileSync(file.path),file.name,args[0]);
        for(const hit of hits)results.push({...hit,file:file.name});
      }catch(e){errors.push({file:file.name,error:e.message})}
    }
    console.log(JSON.stringify({results:results.sort((a,b)=>b.score-a.score).slice(0,200),errors},null,2));
    if(errors.length)process.exitCode=2;
  } else if (command === 'ixl' && args.length >= 4) {
    const [output, title, destination, ...sources] = args;
    save(output, createProject(title, sources.join('\n'), destination, '0', 'include'));
  } else {
    throw Error('用法請見 SKILL.md，可用命令為 txt、batch-txt、batch-html、batch-epub、search、plucker、export、palmdoc、inspect、ixl。');
  }
} catch (error) { console.error(error.message); process.exitCode=1; }
