---
name: pdb-workbench
description: 讀取 SDoc / SilX 圖文 PDB 與 PalmDOC PDB 正文並轉成 UTF-8 純文字、製作 Big5 或 UTF-8 PalmDOC 電子書、辨識 Palm PDB/PRC 檔頭、生成繁中 PDB 轉檔專案。在 Muse 或其他支援 Agent Skills 的代理收到 PDB、繁中電子書或書報製作需求時使用。
---

# PDB 電子書工作台

使用 Node.js 18 或更新版本，從本技能所在資料夾執行命令。將範例中的路徑換成使用者實際提供的路徑，保留繁體中文原文。

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

詩歌編輯、和弦移調、EPUB、網頁合訂、書架或多書設定，使用同一專案的 `docs/index.html` 網頁入口。僅安裝技能資料夾時，可執行上述四個命令。
