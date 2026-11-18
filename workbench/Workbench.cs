using System;
using System.IO;
using System.Text;
using System.Net;
using System.Net.Sockets;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security;
using System.Threading;
using System.IO.Compression;
using System.Xml;
using System.Text.RegularExpressions;

public static class PdbWorkbench {
    const int Limit = 32 * 1024 * 1024;
    static readonly Encoding Utf8 = new UTF8Encoding(false);
    static string root, authority;
    static readonly SemaphoreSlim jobs = new SemaphoreSlim(1);

    static string Engine() {
        foreach (var file in new [] {Environment.GetEnvironmentVariable("ISILOXC_PATH"),
                Path.Combine(root, "iSiloXC.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"iSilo\iSiloX\iSiloXC.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"iSilo\iSiloX\iSiloXC.exe")})
            if (!String.IsNullOrEmpty(file) && File.Exists(file)) return Path.GetFullPath(file);
        return null;
    }
    public static void Run(string path) {
        root = path;
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        authority = "127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port;
        var url = "http://" + authority + "/";
        Console.WriteLine(url + "  (Ctrl+C to stop)");
        if (Environment.GetEnvironmentVariable("PDB_NO_BROWSER") != "1")
            Process.Start(new ProcessStartInfo(url) {UseShellExecute=true});
        while (true) {
            var client = listener.AcceptTcpClient();
            ThreadPool.QueueUserWorkItem(delegate { Serve(client); });
        }
    }
    static void Reply(Stream stream, int code, string type, byte[] body) {
        var header = "HTTP/1.1 " + code + " " + (code == 200 ? "OK" : "Error") + "\r\nContent-Type: " + type +
          "\r\nContent-Length: " + body.Length + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nConnection: close\r\n\r\n";
        var bytes = Encoding.ASCII.GetBytes(header);
        stream.Write(bytes, 0, bytes.Length);
        stream.Write(body, 0, body.Length);
    }
    static void Serve(TcpClient client) {
        using (client) {
            client.ReceiveTimeout = 20000;
            client.SendTimeout = 20000;
            var stream = client.GetStream();
            Handle(stream, stream);
        }
    }
    static void Handle(Stream input, Stream response) {
            try {
                var bytes = new List<byte>();
                while (true) {
                    int ch = input.ReadByte();
                    if (ch < 0) return;
                    bytes.Add((byte)ch);
                    int n = bytes.Count;
                    if (n > 8192) throw new ArgumentException("要求標頭過長。");
                    if (n >= 4 && bytes[n-4] == 13 && bytes[n-3] == 10 && bytes[n-2] == 13 && ch == 10) break;
                }
                var lines = Encoding.ASCII.GetString(bytes.ToArray()).Split(new[]{"\r\n"},StringSplitOptions.RemoveEmptyEntries);
                var fields = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
                for(int i=1;i<lines.Length;i++) {
                    int p = lines[i].IndexOf(':');
                    if(p > 0) fields[lines[i].Substring(0,p)] = lines[i].Substring(p+1).Trim();
                }
                if (!fields.ContainsKey("Host") || fields["Host"] != authority) throw new ArgumentException("連線來源錯誤。");
                var request = lines[0].Split(' ');
                if (request[0] == "GET" && (request[1] == "/" || request[1] == "/native")) {
                    string page = request[1] == "/" && File.Exists(Path.Combine(root,"studio.html")) ? "studio.html" : "index.html";
                    Reply(response,200,"text/html; charset=utf-8",File.ReadAllBytes(Path.Combine(root,page))); return;
                }
                if (request[0] == "GET" && request[1] == "/status") {
                    Reply(response,200,"text/plain",Utf8.GetBytes(Engine()==null ? "missing" : "ready")); return;
                }
                if (request[0] != "POST" || request[1] != "/convert") {
                    Reply(response,404,"text/plain",new byte[0]); return;
                }
                if (!fields.ContainsKey("Origin") || fields["Origin"] != "http://" + authority ||
                    !fields.ContainsKey("X-PDB-Source")) throw new ArgumentException("請從本機工作頁轉檔。");
                int length;
                if (!fields.ContainsKey("Content-Length") || !Int32.TryParse(fields["Content-Length"],out length) ||
                    length <= 0 || length > Limit) throw new ArgumentException("請選擇 1 byte 至 32 MB 的來源。");
                string ext = fields["X-PDB-Source"];
                if (Array.IndexOf(new[]{"txt","html","htm","epub","paste"}, ext)<0) throw new ArgumentException("不支援此格式。");
                string title = fields.ContainsKey("X-PDB-Title") ? Uri.UnescapeDataString(fields["X-PDB-Title"]).Trim() : "";
                if (title.Length == 0 || title.Length>31) throw new ArgumentException("書名請填 1 至 31 個字。");
                var engine = Engine();
                if (engine == null) throw new InvalidOperationException("請重新執行 Start.cmd 並選擇相容的轉檔引擎。");
                if (!jobs.Wait(0)) throw new InvalidOperationException("目前正在轉檔，請稍後再試。");
                try {
                    var body = new byte[length];
                    int read = 0;
                    while (read<length) {
                        int count = input.Read(body,read,length-read);
                        if(count==0) throw new EndOfStreamException();
                        read += count;
                    }
                    Reply(response,200,"application/octet-stream",ConvertDocument(engine,title,ext,body));
                } finally {jobs.Release();}
            } catch(Exception ex) {
                try {Reply(response,ex is ArgumentException ? 400 : 422,"text/plain; charset=utf-8",Utf8.GetBytes(ex.Message));} catch(IOException){}
            }
    }
    static string LocalMember(string rootDir, string parent, string name, bool fromHref) {
        if (fromHref) name=Uri.UnescapeDataString(name);
        if (String.IsNullOrEmpty(name) || name.StartsWith("/") || name.Contains("\\") || name.Contains(":"))
            throw new InvalidDataException("EPUB 內含不支援的檔案路徑。");
        foreach (string segment in name.Split('/')) {
            if (fromHref && (segment=="." || segment=="..")) continue;
            if (segment.Length==0 || segment.EndsWith(".") || segment.EndsWith(" ") ||
                segment.IndexOfAny(Path.GetInvalidFileNameChars())>=0 ||
                Regex.IsMatch(segment,@"^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)",RegexOptions.IgnoreCase))
                throw new InvalidDataException("EPUB 內含不支援的檔案名稱。");
        }
        string full=Path.GetFullPath(Path.Combine(parent,name.Replace('/',Path.DirectorySeparatorChar)));
        if (!full.StartsWith(rootDir+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("EPUB 內部檔案路徑超出書籍範圍。");
        return full;
    }
    static XmlDocument ReadEpubXml(string path) {
        var settings=new XmlReaderSettings { DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=8*1024*1024 };
        var doc=new XmlDocument { XmlResolver=null };
        using(var reader=XmlReader.Create(path,settings)) doc.Load(reader);
        return doc;
    }
    static List<string> ExtractEpub(string dir, byte[] source) {
        string folder=Path.Combine(dir,"epub");
        Directory.CreateDirectory(folder);
        var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        const long unpackLimit=96L*1024*1024;
        long total=0;
        byte[] buffer=new byte[32768];
        using(var memory=new MemoryStream(source,false))
        using(var archive=new ZipArchive(memory,ZipArchiveMode.Read)) {
            if(archive.Entries.Count>12000) throw new InvalidDataException("EPUB 超過 12,000 個項目。");
            foreach(var item in archive.Entries) {
                bool directory=item.FullName.EndsWith("/");
                string name=directory?item.FullName.Substring(0,item.FullName.Length-1):item.FullName;
                string path=LocalMember(folder,folder,name,false);
                if(!seen.Add(path)) throw new InvalidDataException("EPUB 內有重複路徑。");
                if(directory){Directory.CreateDirectory(path);continue;}
                if(item.Length>unpackLimit-total) throw new InvalidDataException("EPUB 解開後超過 96 MiB。");
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                using(var input=item.Open())
                using(var output=new FileStream(path,FileMode.CreateNew,FileAccess.Write)) {
                    int n;long copied=0;
                    while((n=input.Read(buffer,0,buffer.Length))>0){
                        total+=n;copied+=n;
                        if(total>unpackLimit || copied>item.Length) throw new InvalidDataException("EPUB 解開後超過容量限制。");
                        output.Write(buffer,0,n);
                    }
                    if(copied!=item.Length)throw new InvalidDataException("EPUB 項目不完整。");
                }
            }
        }
        if(File.Exists(Path.Combine(folder,@"META-INF\encryption.xml")))
            throw new InvalidDataException("EPUB 包含加密或混淆資源，請改用未加密版本。");
        var container=ReadEpubXml(Path.Combine(folder,@"META-INF\container.xml"));
        var ns=new XmlNamespaceManager(container.NameTable);
        ns.AddNamespace("c","urn:oasis:names:tc:opendocument:xmlns:container");
        var package=(XmlElement)container.SelectSingleNode("/c:container/c:rootfiles/c:rootfile[@media-type='application/oebps-package+xml']",ns);
        if(package==null)throw new InvalidDataException("EPUB 缺少 OPF 主檔。");
        var opfPath=LocalMember(folder,folder,package.GetAttribute("full-path"),true);
        var opf=ReadEpubXml(opfPath);
        var opfNs=new XmlNamespaceManager(opf.NameTable);
        opfNs.AddNamespace("o","http://www.idpf.org/2007/opf");
        var manifest=new Dictionary<string,XmlElement>(StringComparer.Ordinal);
        foreach(XmlElement item in opf.SelectNodes("/o:package/o:manifest/o:item",opfNs))
            manifest.Add(item.GetAttribute("id"),item);
        var chapters=new List<string>();
        foreach(XmlElement reference in opf.SelectNodes("/o:package/o:spine/o:itemref",opfNs)) {
            XmlElement item;
            if(!manifest.TryGetValue(reference.GetAttribute("idref"),out item))throw new InvalidDataException("EPUB 章節找不到對應檔案。");
            string media=item.GetAttribute("media-type");
            if(media!="application/xhtml+xml" && media!="text/html")throw new InvalidDataException("EPUB 含有不支援的章節格式："+media);
            string chapter=LocalMember(folder,Path.GetDirectoryName(opfPath),item.GetAttribute("href"),true);
            if(!File.Exists(chapter))throw new InvalidDataException("EPUB 章節檔案不存在。");
            chapters.Add(chapter.Substring(dir.Length+1));
        }
        if(chapters.Count==0)throw new InvalidDataException("EPUB 閱讀順序為空。");
        return chapters;
    }
    static byte[] ConvertDocument(string engine, string title, string ext, byte[] source) {
        var dir = Path.Combine(Path.GetTempPath(),"pdb-work-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try {
            if (ext=="txt") {
                try { new UTF8Encoding(false,true).GetCharCount(source); }
                catch (DecoderFallbackException) {throw new ArgumentException("TXT 需要 UTF-8 編碼。請在記事本另存為 UTF-8，或改用貼上文字。");}
            }
            if (ext=="paste") {
                ext="html";
                string paragraphs=SecurityElement.Escape(Utf8.GetString(source)).Replace("\r\n","\n").Replace("\r","\n").Replace("\n","<br>");
                source=Utf8.GetBytes("<html><head><meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\"></head><body>"+paragraphs+"</body></html>");
            }
            List<string> paths;
            if(ext=="epub") paths=ExtractEpub(dir,source);
            else {
                string sourceName="source."+ext;
                File.WriteAllBytes(Path.Combine(dir,sourceName),source);
                paths=new List<string>{sourceName};
            }
            var sources=new StringBuilder();
            foreach(string path in paths) sources.Append("<Path>").Append(SecurityElement.Escape(path)).Append("</Path>");
            string xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><iSiloXDocumentList><iSiloXDocument><Source><Sources>"+sources+"</Sources>"+
              (ext=="txt" ? "<CharSet>UTF-8</CharSet>" : "")+"</Source><Destination><Title>"+SecurityElement.Escape(title)+
              "</Title><Files><Path>book.pdb</Path></Files></Destination><LinkOptions><MaximumDepth value=\"0\"/><FollowOffsite value=\"no\"/></LinkOptions><DocumentOptions><CharSet>UTF-8</CharSet></DocumentOptions></iSiloXDocument></iSiloXDocumentList>";
            File.WriteAllText(Path.Combine(dir,"job.ixl"),xml,Utf8);
            var pi = new ProcessStartInfo(engine,"-x job.ixl") {WorkingDirectory=dir,UseShellExecute=false,CreateNoWindow=true};
            Process started;
            try {started=Process.Start(pi);}
            catch(System.ComponentModel.Win32Exception ex) {
                if(ex.NativeErrorCode==623) throw new InvalidOperationException("Windows 無法載入這個版本的 PDB 轉檔引擎（錯誤 623）。可改選其他相容版本。",ex);
                throw new InvalidOperationException("Windows 無法啟動 PDB 轉檔引擎（錯誤 "+ex.NativeErrorCode+"）。"+ex.Message,ex);
            }
            using (var proc=started) {
                if(!proc.WaitForExit(120000)) {proc.Kill();proc.WaitForExit();throw new InvalidOperationException("轉檔逾時，請縮小來源後再試。");}
                if (proc.ExitCode!=0) throw new InvalidOperationException("PDB 轉檔引擎 轉檔失敗（代碼 "+proc.ExitCode+"）。請檢查來源格式。");
            }
            string output=Path.Combine(dir,"book.pdb");
            if(!File.Exists(output)) throw new InvalidOperationException("引擎未產生 PDB。請確認來源可讀取。");
            var book=File.ReadAllBytes(output);
            if(book.Length<86 || Encoding.ASCII.GetString(book,60,8)!="SDocSilX") throw new InvalidOperationException("輸出未通過 圖文 PDB 檔頭檢查。");
            return book;
        } finally {Directory.Delete(dir,true);}
    }
}


