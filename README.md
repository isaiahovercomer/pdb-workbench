# PDB 電子書工作台

以繁體中文編輯詩歌與書報、合訂網頁、讀寫 PalmDOC，或建立 PDB 批次轉檔專案。

- 網頁入口為 [docs/index.html](docs/index.html)。GitHub Pages 使用 main 分支的 /docs 資料夾。
- Muse 或其他支援 Agent Skills 的代理可載入 [skills/pdb-workbench/SKILL.md](skills/pdb-workbench/SKILL.md)。安裝時請保留整個資料夾及 scripts 子目錄。
- 修改網頁或 Windows 工作台後，執行 `python site/assemble.py` 可重建網站、下載包及技能核心。原廠 PDB 轉檔引擎 由使用者另行選取。

在網頁選「PDB 轉 TXT」可讀取 SDoc 與 PalmDOC，直接下載全書 UTF-8 純文字。Muse 使用 `node scripts/run.cjs txt "來源.pdb" "全書.txt"`。圖文 PDB（SDoc / SilX）的正文直接在瀏覽器或 Node.js 解碼，毋須另外安裝閱讀器。

## 閱讀、批次與匯出

在「PDB 轉 TXT → 批次轉 TXT、HTML 或 EPUB」選取多個 PDB、PRC 或整個資料夾。可選 TXT、HTML 或 EPUB。下載的 ZIP 包含每本書的輸出檔及逐檔結果。可讀格式包括 PalmDOC、支援的 SDoc 以及 Palm 備忘錄、通訊錄、行事曆與待辦事項。

開啟單本後可下載 HTML 或 EPUB。SDoc 匯出會採用可辨識的原書目錄，還原可辨識的表格、合併儲存格、原書連結與行內圖片。其餘可解碼的圖片列在附錄。書架可整批匯入，依書名、章名與正文搜尋並跳至命中位置。

「詩歌與書報」支援逐行經文、和弦移調，以及 HTML、EPUB、Excel、ChordPro 和 Plucker PDB 匯出。Muse 可使用相同的匯出格式、以來源清單重新製書，或將網頁合訂為離線 HTML。命令與範例見 [Muse 使用說明](skills/pdb-workbench/SKILL.md)。

在 Muse 使用 `node scripts/run.cjs search "關鍵詞" "藏書資料夾"`，會依關聯程度列出書名、章節與段落摘錄。

整個資料夾批次轉 HTML 或 EPUB 時，分別執行 `node scripts/run.cjs batch-html "網頁.zip" "藏書資料夾"` 或 `node scripts/run.cjs batch-epub "電子書.zip" "藏書資料夾"`。每本各產生一個檔案，重複檔名自動編號，個別失敗會記錄在清單中。

Plucker PDB 可用同一組閱讀、TXT 與批次指令抽取文字頁，支援未壓縮、zlib、PalmDOC 壓縮及 Unicode 文字標記。讀回以正文為主。

[下載 Muse 技能 ZIP](https://isaiahovercomer.github.io/pdb-workbench/pdb-workbench-skill.zip)。解壓後保留整個 pdb-workbench 資料夾。

原書圖片含可辨識的 RGB565 圖層時，HTML 與 EPUB 保留彩色，其餘支援的圖層按灰階輸出。
