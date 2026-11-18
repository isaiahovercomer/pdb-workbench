# PDB 電子書工作台

以繁體中文編輯詩歌與書報、合訂網頁、讀寫 PalmDOC，或建立 PDB 批次轉檔專案。

- 網頁入口為 [docs/index.html](docs/index.html)。GitHub Pages 使用 main 分支的 /docs 資料夾。
- Muse 或其他支援 Agent Skills 的代理可載入 [skills/pdb-workbench/SKILL.md](skills/pdb-workbench/SKILL.md)。安裝時請保留整個資料夾及 scripts 子目錄。
- 修改網頁或 Windows 工作台後，執行 `python site/assemble.py` 可重建網站、下載包及技能核心。原廠 PDB 轉檔引擎 由使用者另行選取。
