function bookText(reader, bytes, encoding) {
  if (bytes.length > reader.maxBytes) throw Error('單本檔案上限為 48 MiB。');
  const db = reader.parsePdb(bytes);
  reader.requireTextFormat(db);
  const plain = reader.extract(bytes, db);
  const selected = encoding === 'auto' ? db.encoding || 'auto' : encoding;
  return reader.decode(plain, selected).replace(/\r\n?/g, '\n');
}
async function batchBooks(files, reader, encoding, progress = () => {}) {
  const entries = [], report = [], used = new Set(['轉檔清單.txt']);
  for (const file of files) {
    let line;
    try {
      if (file.size > reader.maxBytes) throw Error('單本檔案上限為 48 MiB。');
      const text = bookText(reader, await file.load(), encoding);
      let stem = file.name.split(/[\\/]/).pop().replace(/\.(pdb|prc)$/i,'').normalize('NFC')
        .replace(/[<>:"|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,110) || '書籍';
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(stem)) stem = '_'+stem;
      let name = stem+'.txt', index = 1;
      while (used.has(name.toLowerCase())) name = stem+' ('+(++index)+').txt';
      used.add(name.toLowerCase());
      entries.push([name,new TextEncoder().encode(text)]);
      line = '成功　'+file.name+' → '+name;
    } catch (error) { line = '失敗　'+file.name+'　'+error.message; }
    report.push(line);
    progress(report.length, files.length, line);
  }
  const summary = '成功 '+entries.length+' 本，失敗 '+(files.length-entries.length)+' 本';
  entries.push(['轉檔清單.txt',summary+'\n\n'+report.join('\n')+'\n']);
  return {entries, summary, succeeded:entries.length-1};
}
module.exports={bookText,batchBooks};
