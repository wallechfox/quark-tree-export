// ==UserScript==
// @name         夸克云盘目录树导出工具
// @namespace    https://github.com/wallechfox/quark-tree-export
// @version      1.0.0
// @description  免登录导出夸克分享目录树，支持层级展开、文件大小、TXT/Markdown 导出
// @author       wallechfox
// @match        https://pan.quark.cn/s/*
// @match        https://pan.quark.cn/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @license      MIT
// @supportURL   https://github.com/wallechfox/quark-tree-export/issues
// ==/UserScript==
(function () {
    'use strict';

    // ============ 配置 ============
    const API = "https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail";
    const CONCURRENCY = 8;
    const RETRY = 4;
    const PAGE_SIZE = 50;

    // ============ 状态 ============
    let shareInfo = null;
    let shareFolderName = "";
    let isScanning = false;
    let lastItems = [];
    let lastTree = null;
    let lastResultText = "";
    let pageCache = new Map();

    const sleep = t => new Promise(r => setTimeout(r, t));

    // ============ 分享信息 ============
    function getShareInfo() {
        let pwd_id = null, stoken = "", title = "";
        try {
            const raw = sessionStorage.getItem("_share_args");
            if (raw) {
                const parsed = JSON.parse(raw);
                const val = parsed.value || parsed;
                if (val && val.pwd_id) {
                    pwd_id = val.pwd_id;
                    stoken = val.stoken || "";
                    title = val.title || val.share_title || val.name || val.share_name || val.pwd_name || "";
                }
            }
        } catch (e) { /* ignore */ }
        if (!pwd_id) {
            const m = location.pathname.match(/\/s\/([a-zA-Z0-9]+)/);
            if (m) pwd_id = m[1];
        }
        if (!title && document.title) {
            title = document.title.replace(/[-_—|]\s*夸克[^\s]*.*$/, "").trim()
                                  .replace(/^【.*?】/, "").trim();
        }
        if (!pwd_id) return null;
        return { pwd_id, stoken, title: title || "" };
    }

    function ensureShareInfo() {
        shareInfo = getShareInfo();
        return !!shareInfo;
    }

    // ============ API 请求 ============
    async function fetchPage(fid, page) {
        if (page === 1 && pageCache.has(fid)) return pageCache.get(fid);

        const params = new URLSearchParams({
            pr: "ucpro", fr: "pc",
            pwd_id: shareInfo.pwd_id,
            stoken: shareInfo.stoken || "",
            pdir_fid: fid, force: "0",
            _page: String(page), _size: String(PAGE_SIZE)
        });
        for (let i = 0; i < RETRY; i++) {
            try {
                const r = await fetch(`${API}?${params}`, { credentials: "include" });
                if (r.status === 400) throw new Error("参数失效(可能需要输入提取码)");
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const j = await r.json();
                extractShareName(j);
                if (page === 1) pageCache.set(fid, j);
                return j;
            } catch (e) {
                if (i === RETRY - 1) { console.error("[quark-tree] fetchPage failed:", e); return null; }
                await sleep(800 + Math.random() * 1200);
            }
        }
        return null;
    }

    function extractShareName(j) {
        if (!j || !j.data || shareFolderName) return;
        const d = j.data;
        const s = d.share || {};
        shareFolderName =
            d.share_title || s.share_title || s.title || s.share_name || s.pwd_name ||
            d.title || d.folder_name || d.share_folder_name || s.folder_name || d.name || "";
    }

    async function fetchShareMeta() {
        pageCache.clear();
        await fetchPage("0", 1);
    }

    async function listAll(fid) {
        const all = [];
        let page = 1;
        while (true) {
            const j = await fetchPage(fid, page);
            if (!j || !j.data || !Array.isArray(j.data.list) || j.data.list.length === 0) break;
            all.push(...j.data.list);
            const total = j.data.total || 0;
            if (all.length >= total || j.data.list.length < PAGE_SIZE) break;
            page++;
            await sleep(80 + Math.random() * 120);
        }
        return all;
    }

    // ============ 扫描 ============
    async function scanRoot(depth) {
        const items = [];
        const visited = new Set(["0"]);
        const queue = [{ fid: "0", path: "", depth: 0, isFolder: true, size: 0 }];
        async function worker() {
            while (queue.length > 0) {
                const task = queue.shift();
                if (!task) break;
                if (task.depth > depth) continue;
                const list = await listAll(task.fid);
                for (const it of list) {
                    const full = (task.path ? task.path : "") + "/" + it.file_name;
                    items.push({ path: full, size: it.size || 0, isFolder: !!it.dir });
                    if (it.dir && !visited.has(it.fid)) {
                        visited.add(it.fid);
                        queue.push({ fid: it.fid, path: full, depth: task.depth + 1, isFolder: true, size: 0 });
                    }
                }
            }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
        return items;
    }

    // ============ 构建树 ============
    function buildTree(items) {
        const root = { name: "ROOT", isFolder: true, size: 0, children: {} };
        for (const item of items) {
            const parts = item.path.split("/").filter(Boolean);
            let node = root;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;
                if (!node.children[part]) {
                    node.children[part] = { name: part, isFolder: false, size: 0, children: {} };
                }
                const child = node.children[part];
                if (isLast) {
                    child.isFolder = item.isFolder;
                    child.size = item.size || 0;
                } else {
                    child.isFolder = true;
                }
                node = child;
            }
        }
        computeFolderSizes(root);
        return root;
    }

    function computeFolderSizes(node) {
        let total = node.isFolder ? 0 : (node.size || 0);
        for (const k of Object.keys(node.children)) {
            total += computeFolderSizes(node.children[k]);
        }
        if (node.isFolder) node.size = total;
        return total;
    }

    function countChildren(node) {
        const keys = Object.keys(node.children);
        let folders = 0, files = 0;
        for (const k of keys) node.children[k].isFolder ? folders++ : files++;
        return { folders, files, total: keys.length };
    }

    function formatSize(bytes) {
        if (!bytes) return "";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let v = bytes, i = 0;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return v.toFixed(i === 0 ? 0 : 2) + " " + units[i];
    }

    function generateTreeText(root) {
        const lines = [];
        function walk(children, prefix, isTop) {
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const isLast = i === children.length - 1;
                let line = prefix + (isTop ? "" : (isLast ? "└── " : "├── "));
                line += child.name + (child.isFolder ? "/" : "");
                if (child.size) line += "  (" + formatSize(child.size) + ")";
                lines.push(line);
                if (child.isFolder) {
                    const childChildren = sortedKeys(child).map(k => child.children[k]);
                    walk(childChildren, prefix + (isLast ? "    " : "│   "), false);
                }
            }
        }
        walk(sortedKeys(root).map(k => root.children[k]), "", true);
        return lines.join("\n");
    }

    // ============ 下载 ============
    function downloadTxt(text, filename) {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename || "quark目录.txt";
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    function escapeHtml(s) {
        const div = document.createElement("div");
        div.textContent = s;
        return div.innerHTML;
    }

    // ============ 样式（浅色主题） ============
    const STYLE = `
#qte-fab {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff; border: none; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,.15);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; transition: transform .2s;
}
#qte-fab:hover { transform: scale(1.08); }

#qte-mask {
  position: fixed; inset: 0; z-index: 2147483646;
  background: rgba(0,0,0,.2); display: none;
}
#qte-mask.show { display: block; }

#qte-drawer {
  position: fixed; top: 0; right: 0;
  width: 75vw; max-width: 1000px; min-width: 400px; height: 100vh;
  background: #ffffff; color: #1e293b;
  z-index: 2147483647;
  transform: translateX(100%);
  transition: transform .28s ease;
  display: grid;
  grid-template-rows: auto auto auto 1fr auto;
  box-shadow: -4px 0 20px rgba(0,0,0,.1);
  overflow: hidden;
  font-family: -apple-system, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
}
#qte-drawer.show { transform: translateX(0); }

#qte-head {
  padding: 12px 20px; background: #f8fafc;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
}
#qte-title { font-size: 16px; font-weight: 600; color: #1e293b; }
#qte-close {
  background: none; border: none; color: #64748b; font-size: 26px;
  cursor: pointer; line-height: 1;
}
#qte-close:hover { color: #1e293b; }

#qte-url-bar {
  padding: 8px 20px; background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-size: 12px; color: #64748b;
  display: flex; align-items: center; gap: 8px;
}
#qte-url-bar a { color: #3b82f6; text-decoration: none; word-break: break-all; }
#qte-url-bar a:hover { text-decoration: underline; }

#qte-controls {
  padding: 12px 20px; background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.qte-ctrl-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.qte-label { font-size: 13px; color: #64748b; }
.qte-depth {
  width: 64px; padding: 5px 8px; background: #fff; color: #1e293b;
  border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;
}
.qte-btn {
  background: #3b82f6; color: #fff; border: none; padding: 6px 14px;
  border-radius: 6px; cursor: pointer; font-size: 13px;
}
.qte-btn:hover { background: #2563eb; }
.qte-btn.ghost { background: #e2e8f0; color: #1e293b; }
.qte-btn.ghost:hover { background: #cbd5e1; }
.qte-btn:disabled { opacity: .5; cursor: not-allowed; }
#qte-progress { font-size: 12px; color: #64748b; }

#qte-tree-wrap {
  min-height: 0; min-width: 0;
  overflow-y: auto; overflow-x: auto;
  overscroll-behavior: contain;
  padding: 16px 20px; background: #ffffff;
}
#qte-tree-wrap::-webkit-scrollbar { width: 8px; height: 8px; }
#qte-tree-wrap::-webkit-scrollbar-track { background: #f1f5f9; }
#qte-tree-wrap::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
#qte-tree-wrap::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
#qte-tree-wrap { scrollbar-width: thin; scrollbar-color: #cbd5e1 #f1f5f9; }
#qte-tree {
  font-family: "Consolas", "Microsoft YaHei", monospace;
  font-size: 13px; line-height: 1.7;
}
#qte-tree ul {
  list-style: none; padding-left: 20px; margin: 0;
  position: relative;
}
#qte-tree > ul { padding-left: 0; }
#qte-tree ul::before {
  content: ''; position: absolute; left: 6px; top: 0; bottom: 8px;
  width: 1px; background: #cbd5e1; opacity: .6;
}
#qte-tree > ul::before { display: none; }
#qte-tree li { position: relative; }
.qte-node {
  display: flex; align-items: center; padding: 1px 6px;
  border-radius: 3px; cursor: pointer; user-select: none;
}
.qte-node:hover { background: #f1f5f9; }
.qte-node::before {
  content: ''; position: absolute; left: -14px; top: 14px;
  width: 14px; height: 1px; background: #cbd5e1; opacity: .6;
}
#qte-tree > ul > li > .qte-node::before { display: none; }
.qte-arrow {
  width: 14px; height: 14px; margin-right: 2px; flex-shrink: 0;
  transition: transform .15s; fill: #64748b;
}
.qte-arrow.expanded { transform: rotate(90deg); }
.qte-arrow.hidden { visibility: hidden; }
.qte-icon { width: 16px; height: 16px; margin-right: 6px; flex-shrink: 0; }
.qte-name { white-space: nowrap; color: #1e293b; }
.qte-meta { color: #94a3b8; font-size: 11px; margin-left: 8px; }
.qte-size { color: #64748b; font-size: 11px; margin-left: 8px; }
.qte-folder-size { color: #d97706; font-size: 11px; margin-left: 8px; }

#qte-foot {
  padding: 10px 20px; background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}
`;

    function injectStyle() {
        const style = document.createElement("style");
        style.textContent = STYLE;
        document.head.appendChild(style);
    }

    // ============ 浮动按钮 ============
    function createFab() {
        const fab = document.createElement("button");
        fab.id = "qte-fab";
        fab.title = "夸克目录树导出";
        fab.textContent = "📂";
        fab.addEventListener("click", toggleDrawer);
        document.body.appendChild(fab);
    }

    // ============ 抽屉面板 ============
    function createDrawer() {
        const mask = document.createElement("div");
        mask.id = "qte-mask";
        mask.addEventListener("click", closeDrawer);

        const drawer = document.createElement("div");
        drawer.id = "qte-drawer";
        drawer.innerHTML = `
          <div id="qte-head">
            <span id="qte-title">📂 夸克云盘目录树导出</span>
            <button id="qte-close">×</button>
          </div>
          <div id="qte-url-bar">
            🔗 当前分享：<a href="${escapeHtml(location.href)}" target="_blank" id="qte-url-link">${escapeHtml(location.href)}</a>
          </div>
          <div id="qte-controls">
            <div class="qte-ctrl-row">
              <span class="qte-label">扫描层级：</span>
              <input type="number" class="qte-depth" id="qte-scan-depth" min="1" max="20" value="4">
              <button class="qte-btn" id="qte-export">🚀 开始导出</button>
              <span id="qte-progress"></span>
            </div>
          </div>
          <div id="qte-tree-wrap">
            <div id="qte-tree"></div>
          </div>
          <div id="qte-foot">
            <button class="qte-btn" id="qte-download">⬇ 下载 TXT</button>
            <button class="qte-btn ghost" id="qte-copy">📋 复制路径</button>
            <button class="qte-btn ghost" id="qte-expand-all">展开全部</button>
            <button class="qte-btn ghost" id="qte-collapse-all">折叠全部</button>
            <span class="qte-label" id="qte-count" style="margin-left:auto;"></span>
          </div>
        `;
        document.body.appendChild(mask);
        document.body.appendChild(drawer);

        drawer.style.setProperty("position", "fixed", "important");
        drawer.style.setProperty("top", "0", "important");
        drawer.style.setProperty("right", "0", "important");
        drawer.style.setProperty("height", "100vh", "important");
        drawer.style.setProperty("display", "grid", "important");
        drawer.style.setProperty("grid-template-rows", "auto auto auto 1fr auto", "important");
        drawer.style.setProperty("overflow", "hidden", "important");
        drawer.style.setProperty("z-index", "2147483647", "important");
        const treeWrap = drawer.querySelector("#qte-tree-wrap");
        treeWrap.style.setProperty("min-height", "0", "important");
        treeWrap.style.setProperty("height", "auto", "important");
        treeWrap.style.setProperty("overflow-y", "scroll", "important");
        treeWrap.style.setProperty("overflow-x", "auto", "important");
        treeWrap.style.setProperty("overscroll-behavior", "contain", "important");
        const treeEl = drawer.querySelector("#qte-tree");
        treeEl.style.setProperty("display", "block", "important");
        treeEl.style.setProperty("height", "auto", "important");
        treeEl.style.setProperty("max-height", "none", "important");

        drawer.querySelector("#qte-close").addEventListener("click", closeDrawer);
        drawer.querySelector("#qte-export").addEventListener("click", doExport);
        drawer.querySelector("#qte-download").addEventListener("click", () => {
            if (!lastResultText) { alert("暂无导出内容，请先导出。"); return; }
            downloadTxt(lastResultText, `quark目录_${shareInfo ? shareInfo.pwd_id : ""}.txt`);
        });
        drawer.querySelector("#qte-copy").addEventListener("click", async () => {
            if (!lastResultText) { alert("暂无导出内容"); return; }
            try { await navigator.clipboard.writeText(lastResultText); alert("已复制到剪贴板"); }
            catch (e) {
                if (typeof GM_setClipboard !== "undefined") { GM_setClipboard(lastResultText); alert("已复制到剪贴板"); }
                else alert("复制失败：" + e.message);
            }
        });
        drawer.querySelector("#qte-expand-all").addEventListener("click", expandAll);
        drawer.querySelector("#qte-collapse-all").addEventListener("click", collapseAll);

        return drawer;
    }

    function toggleDrawer() {
        const drawer = document.getElementById("qte-drawer") || createDrawer();
        const mask = document.getElementById("qte-mask");
        if (drawer.classList.contains("show")) closeDrawer();
        else openDrawer();
    }

    function openDrawer() {
        let drawer = document.getElementById("qte-drawer");
        if (!drawer) drawer = createDrawer();
        const mask = document.getElementById("qte-mask");
        drawer.classList.add("show");
        mask.classList.add("show");
        const link = document.getElementById("qte-url-link");
        if (link) {
            link.href = location.href;
            link.textContent = location.href;
        }
    }

    function closeDrawer() {
        const drawer = document.getElementById("qte-drawer");
        const mask = document.getElementById("qte-mask");
        if (drawer) drawer.classList.remove("show");
        if (mask) mask.classList.remove("show");
    }

    // ============ 树形渲染 ============
    function renderTree(root) {
        const container = document.getElementById("qte-tree");
        container.innerHTML = "";
        const ul = document.createElement("ul");
        renderChildren(ul, root);
        container.appendChild(ul);
    }

    function sortedKeys(node) {
        return Object.keys(node.children).sort((a, b) => {
            const af = node.children[a].isFolder;
            const bf = node.children[b].isFolder;
            if (af !== bf) return af ? -1 : 1;
            return a.localeCompare(b, "zh-CN");
        });
    }

    function renderChildren(ul, parentNode) {
        for (const key of sortedKeys(parentNode)) {
            ul.appendChild(createNodeEl(parentNode.children[key]));
        }
    }

    function createNodeEl(node) {
        const li = document.createElement("li");
        li.className = node.isFolder ? "qte-folder" : "qte-file";
        li._node = node;

        const row = document.createElement("div");
        row.className = "qte-node";

        const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        arrow.setAttribute("class", "qte-arrow" + (node.isFolder ? "" : " hidden"));
        arrow.setAttribute("viewBox", "0 0 24 24");
        arrow.innerHTML = '<path d="M10 17l5-5-5-5v10z"/>';

        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("class", "qte-icon");
        icon.setAttribute("viewBox", "0 0 24 24");
        if (node.isFolder) {
            icon.setAttribute("fill", "#f59e0b");
            icon.innerHTML = '<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>';
        } else {
            icon.setAttribute("fill", "#64748b");
            icon.innerHTML = '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/>';
        }

        const name = document.createElement("span");
        name.className = "qte-name";
        name.textContent = node.name;

        row.appendChild(arrow);
        row.appendChild(icon);
        row.appendChild(name);

        if (node.isFolder) {
            const c = countChildren(node);
            const meta = document.createElement("span");
            meta.className = "qte-meta";
            meta.textContent = c.total > 0 ? `（${c.folders} 文件夹 / ${c.files} 文件）` : "（空）";
            row.appendChild(meta);
            const sz = formatSize(node.size);
            if (sz) {
                const sizeEl = document.createElement("span");
                sizeEl.className = "qte-folder-size";
                sizeEl.textContent = sz;
                row.appendChild(sizeEl);
            }
        } else if (node.size) {
            const sz = document.createElement("span");
            sz.className = "qte-size";
            sz.textContent = formatSize(node.size);
            row.appendChild(sz);
        }

        li.appendChild(row);

        if (node.isFolder) {
            const childUl = document.createElement("ul");
            childUl.style.display = "none";
            li.appendChild(childUl);

            row.addEventListener("click", () => {
                const hidden = childUl.style.display === "none";
                if (hidden) {
                    if (childUl.children.length === 0) renderChildren(childUl, node);
                    childUl.style.display = "block";
                    arrow.classList.add("expanded");
                } else {
                    childUl.style.display = "none";
                    arrow.classList.remove("expanded");
                }
            });
        }
        return li;
    }

    function expandAll() {
        if (!lastTree) return;
        const container = document.getElementById("qte-tree");
        container.innerHTML = "";
        const ul = document.createElement("ul");
        renderAll(ul, lastTree);
        container.appendChild(ul);
    }

    function renderAll(ul, node) {
        for (const key of sortedKeys(node)) {
            const child = node.children[key];
            const li = createNodeEl(child);
            ul.appendChild(li);
            if (child.isFolder && Object.keys(child.children).length > 0) {
                const childUl = li.querySelector("ul");
                renderAll(childUl, child);
                childUl.style.display = "block";
                li.querySelector(".qte-arrow").classList.add("expanded");
            }
        }
    }

    function collapseAll() {
        if (!lastTree) return;
        renderTree(lastTree);
    }

    // ============ 导出主流程 ============
    async function doExport() {
        if (isScanning) return;
        if (!ensureShareInfo()) {
            alert("未检测到分享信息，请确认当前在夸克分享页面且已输入提取码。");
            return;
        }
        const scanDepth = parseInt(document.getElementById("qte-scan-depth").value, 10);
        if (!scanDepth || scanDepth < 1) { alert("请输入有效的扫描层级（≥1）"); return; }

        const exportBtn = document.getElementById("qte-export");
        const progressEl = document.getElementById("qte-progress");
        const treeEl = document.getElementById("qte-tree");
        const countEl = document.getElementById("qte-count");

        isScanning = true;
        exportBtn.disabled = true;
        exportBtn.textContent = "⏳ 扫描中…";
        progressEl.textContent = "准备扫描…";
        treeEl.innerHTML = '<div style="color:#64748b;padding:10px;">扫描中，请稍候…</div>';
        shareFolderName = "";

        try {
            progressEl.textContent = "获取分享信息…";
            await fetchShareMeta();

            progressEl.textContent = `扫描全部根目录，扫描深度 ${scanDepth}…`;
            const items = await scanRoot(scanDepth);

            items.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
            lastItems = items;
            lastTree = buildTree(items);

            const treeText = generateTreeText(lastTree);
            lastResultText = location.href + "\n" + "=================================\n" + treeText;

            renderTree(lastTree);

			expandToDepth(scanDepth); 

            const folderCount = items.filter(i => i.isFolder).length;
            const fileCount = items.length - folderCount;
            const totalSize = formatSize(lastTree.size || 0);
            countEl.textContent = `共 ${items.length} 项（文件夹 ${folderCount} / 文件 ${fileCount}）` + (totalSize ? `，总计 ${totalSize}` : "");
            progressEl.textContent = `✅ 扫描完成（扫描 ${scanDepth} 层），已下载 TXT。`;

            downloadTxt(lastResultText, `quark目录_${shareInfo.pwd_id}.txt`);
        } catch (e) {
            console.error(e);
            progressEl.textContent = "❌ 导出失败：" + e.message;
            alert("导出失败：" + e.message);
        } finally {
            isScanning = false;
            exportBtn.disabled = false;
            exportBtn.textContent = "🚀 开始导出";
        }
    }


function expandToDepth(depth) {
    const container = document.getElementById("qte-tree");
    if (!container) return;

    function walk(ul, currentDepth) {
        if (currentDepth > depth) return;
        const lis = ul.querySelectorAll(":scope > li");
        for (const li of lis) {
            const row = li.querySelector(":scope > .qte-node");
            const childUl = li.querySelector(":scope > ul");
            if (!row || !childUl) continue;

            const node = li._node;
            if (node && node.isFolder) {
                if (childUl.children.length === 0) {
                    renderChildren(childUl, node);
                }
                childUl.style.display = "block";
                const arrow = row.querySelector(".qte-arrow");
                if (arrow) arrow.classList.add("expanded");
                walk(childUl, currentDepth + 1);
            }
        }
    }

    const rootUl = container.querySelector(":scope > ul");
    if (rootUl) walk(rootUl, 1);
}



    // ============ 启动 ============
    function init() {
        injectStyle();
        createFab();
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                shareInfo = null;
                pageCache.clear();
                const link = document.getElementById("qte-url-link");
                if (link) { link.href = location.href; link.textContent = location.href; }
            }
        }).observe(document, { subtree: true, childList: true });
    }

    if (document.body) init();
    else window.addEventListener("DOMContentLoaded", init);
})();