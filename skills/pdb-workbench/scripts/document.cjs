const {originalChapters,textChapters}=require('./search.cjs');
const {sdocImages}=require('./images.cjs');
const {sdocLayout}=require('./layout.cjs');
// SHARED_DOCUMENT
function decodedBook(reader,bytes,title,choice='auto'){
  if(bytes.length>reader.maxBytes)throw Error('單本檔案上限為 48 MiB。');
  const db=reader.parsePdb(bytes);
  reader.requireTextFormat(db);
  const plain=reader.extract(bytes,db),encoding=choice==='auto'?db.encoding||'auto':choice;
  const body=reader.decode(plain,encoding).replace(/\r\n?/g,'\n');
  const original=originalChapters(bytes,db,plain,encoding);
  const chapters=textChapters(body,original).map(c=>({...c,literal:true}));
  const book={title,author:'',chapters,images:sdocImages(bytes,db)};
  sdocLayout(bytes,db,plain,encoding,chapters,book.images);
  return book;
}
module.exports={decodedBook};
