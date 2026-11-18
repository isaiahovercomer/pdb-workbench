---
name: pdb-workbench
description: 讀取 SDoc / SilX 圖文 PDB 與 PalmDOC PDB 正文並轉成 UTF-8 純文字、批次轉 TXT、匯出 EPUB、HTML、Excel、ChordPro 與 Plucker、依來源清單重建詩歌集、合訂離線網頁、製作 Big5 或 UTF-8 PalmDOC 電子書、辨識 Palm PDB/PRC 檔頭、生成繁中 PDB 轉檔專案。在 Muse 或其他支援 Agent Skills 的代理收到 PDB、繁中電子書或書報製作需求時使用。
---

# PDB 電子書工作台

使用 Node.js 18 或更新版本，從本技能所在資料夾執行命令。將範例中的路徑換成使用者實際提供的路徑，保留繁體中文原文。

- 多本電子書或整個資料夾轉純文字時，執行 `node scripts/run.cjs batch-txt "電子書.zip" "藏書資料夾"`。也可以列出多個來源檔案或目錄。交付 ZIP 與其中的轉檔清單；結束碼 2 表示有個別檔案失敗，成功項目仍在 ZIP 內。

- 收到「把 PDB 轉成純文字」的要求時，執行下列命令，完成後交付整本 TXT。支援 SDoc 正文區塊及 PalmDOC 壓縮。若預覽中文有誤，可指定 big5 或 utf-8，並另選輸出檔名。

  `node scripts/run.cjs txt "電子書.pdb" "電子書.txt" auto`

  SDoc 使用相同命令，無需 Windows 閱讀器。保留文字與換行，圖片不含在 TXT 中。若遇到受保護、無法驗證或不支援的檔案，傳達命令回報的原因。

- 將 UTF-8 或 Big5 文字檔轉成 PalmDOC。第三個參數是書名，第四個參數是輸出編碼。轉檔後執行 inspect 核對 TEXt / REAd。

  `node scripts/run.cjs palmdoc "來源.txt" "輸出.pdb" "我的書報" big5`

- 辨識資料庫名稱、類型、建立程式及記錄數。

  `node scripts/run.cjs inspect "電子書.pdb"`

- 建立給 Windows 原廠引擎使用的 IXL 專案。依序傳入專案檔、書名、Windows 輸出絕對路徑及一個以上來源。來源可填網址或 Windows 絕對路徑。

  `node scripts/run.cjs ixl "書報.ixl" "書報選讀" "C:\Books\書報.pdb" "C:\Books\目錄.html"`

若指定 圖文 PDB，以相容的轉檔引擎執行專案（參數為 `-x 書報.ixl -v`），並檢查產物的 SDoc / SilX 檔頭。若引擎無法執行，交付已生成的 IXL 並明示尚缺 PDB。命令會保留既有輸出檔，請另選新檔名。

## 轉出電子書與重建歌本

- 匯出單本時執行 `node scripts/run.cjs export "來源.pdb" "書報.epub"`。也可輸出 HTML、XLSX、ChordPro（.cho），或 Plucker（.pdb）。SDoc 的 HTML 與 EPUB 包含可解讀的原書目錄與灰階圖片附錄。其他版本、圖片原始位置、原書表格及內文註腳連結需另行核對。
- 將 ChordPro、文字檔或編輯檔轉成歌本，可執行 `node scripts/run.cjs export "來源.cho" "詩歌.xlsx" 2`。最後的數字是移調半音數，範圍 -12 至 12。逐行註腳可用 `{comment: 行註 2 | 詩一三三1}` 表示。
- 從多個來源重建時，建立 UTF-8 JSON，例如 `{"title":"詩歌選","author":"","sources":["第一首.cho","第二首.cho"]}`。依清單順序執行 `node scripts/run.cjs export "清單.json" "詩歌選.epub"`。相對路徑以清單所在目錄為準。
- 舊 Palm 個人資料庫可用 txt 或 batch-txt 讀取 MemoDB 備忘錄、AddressDB 通訊錄、DatebookDB 行事曆及 ToDoDB 待辦事項。
- 製作離線網頁合訂本需 Python 3.9 以上。執行 `python scripts/capture.py "網頁資料夾" "合訂本.html"`，或以完整網址作為來源，加上 `--depth 2 --max-pages 30 --title "書報選讀"`。輸出保留已收錄頁面的內部連結、表格及可讀取的 PNG、JPEG、GIF 圖片。

網頁的「PDB 轉 TXT」提供本機書架、整個資料夾加入書架、跨書搜尋與閱讀位置跳轉。「詩歌與書報」可另選封面、尺寸、灰階色深和 zlib 壓縮，製作 Plucker PDB。
