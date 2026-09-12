#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * 夸克云盘分享目录树 CLI（免登录，仅查看公开分享）
 *
 * 用法:
 *   node index.js <url> [选项]
 *   node index.js                 # 显示帮助
 *
 * 示例:
 *   node index.js "https://pan.quark.cn/s/xxxxxx"
 *   node index.js "https://pan.quark.cn/s/xxxxxx" --depth 3
 *   node index.js "https://pan.quark.cn/s/xxxxxx" --no-expand
 *   node index.js "https://pan.quark.cn/s/xxxxxx" --passcode abcd
 *   node index.js "https://pan.quark.cn/s/xxxxxx" --stoken "xxx"   # 跳过自动换取
 *   node index.js "https://pan.quark.cn/s/xxxxxx" --json
 *   node index.js "https://pan.quark.cn/s/xxxxxx" --output result.txt
 *
 * 接口说明:
 *   - sharepage/token  -> POST {pwd_id, passcode}  换取 stoken
 *   - sharepage/detail -> GET  ?pwd_id=&stoken=&pdir_fid=&...  拉取文件列表
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ============ 配置 ============
const API_HOST = 'drive-pc.quark.cn';
const API_PATH = '/1/clouddrive/share/sharepage/detail';
const PAGE_SIZE = 50;
const RETRY = 3;

// ============ Windows 中文乱码修复 ============
if (process.platform === 'win32') {
  require('child_process').execSync('chcp 65001 >nul 2>&1');
  process.stdout.setDefaultEncoding('utf-8');
  process.stderr.setDefaultEncoding('utf-8');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============ 参数解析 ============
function parseArgs(argv) {
  const args = {
    _: [],
    depth: Infinity,
    expand: true,
    json: false,
    size: PAGE_SIZE,
    stoken: '',
    passcode: '',
    output: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-d':
      case '--depth':
        args.depth = parseInt(argv[++i], 10) || 1;
        break;
      case '--no-expand':
        args.expand = false;
        break;
      case '-j':
      case '--json':
        args.json = true;
        break;
      case '-s':
      case '--size':
        args.size = parseInt(argv[++i], 10) || PAGE_SIZE;
        break;
      case '--stoken':
        args.stoken = argv[++i] || '';
        break;
      case '--passcode':
      case '-p':
        args.passcode = argv[++i] || '';
        break;
      case '-o':
      case '--output':
        args.output = argv[++i] || '';
        break;
      default:
        if (a.startsWith('-')) {
          console.error(`未知参数: ${a}`);
        } else {
          args._.push(a);
        }
    }
  }
  return args;
}

function printHelp() {
  console.log(`
夸克云盘分享目录树 CLI（免登录，查看公开分享）

用法:
  quark-tree <url> [选项]

选项:
  -h, --help            显示帮助
  -d, --depth <n>       展开层级，默认全部 (Infinity)
      --no-expand       折叠模式，只显示第一层
  -j, --json            以 JSON 输出目录树（便于程序处理，不导出 txt）
  -s, --size <n>        每页数量 (默认 50)
      --stoken <token>  直接指定 stoken，跳过自动换取
  -p, --passcode <code> 分享提取码
  -o, --output <file>   导出 txt 路径 (默认自动生成)

示例:
  node index.js "https://pan.quark.cn/s/xxxxxx"
  node index.js "https://pan.quark.cn/s/xxxxxx" --depth 3
  node index.js "https://pan.quark.cn/s/xxxxxx" --passcode abcd
  node index.js "https://pan.quark.cn/s/xxxxxx" --stoken "xxx" --json
  node index.js "https://pan.quark.cn/s/xxxxxx" --output result.txt
`.trim());
}

// ============ URL / 分享信息 ============
function parseUrl(raw) {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/s\/([a-zA-Z0-9]+)/);
    if (!m) return null;
    return {
      pwd_id: m[1],
      stoken: u.searchParams.get('stoken') || '',
    };
  } catch (e) {
    return null;
  }
}

// ============ HTTP ============
function getJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(new Error('响应解析失败: ' + buf.slice(0, 200)));
          }
        });
      })
      .on('error', reject);
  });
}

function postJSON(urlPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(bodyObj);
    const options = {
      hostname: API_HOST,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Referer: 'https://pan.quark.cn/',
        Origin: 'https://pan.quark.cn',
      },
    };
    const req = https.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          reject(new Error('响应解析失败: ' + buf.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ============ 夸克接口 ============
async function getStoken(pwd_id, passcode) {
  const p = '/1/clouddrive/share/sharepage/token';
  const body = { pwd_id, passcode: passcode || '' };

  let lastErr;
  for (let i = 0; i < RETRY; i++) {
    try {
      const j = await postJSON(p, body);
      if (j && j.data && j.data.stoken) {
        return { stoken: j.data.stoken, title: j.data.title || '' };
      }
      if (j && (j.error_msg || j.message)) {
        throw new Error(j.error_msg || j.message);
      }
      throw new Error('换取 stoken 失败：返回结构异常');
    } catch (e) {
      lastErr = e;
      if (i === RETRY - 1) break;
      await sleep(300 * (i + 1));
    }
  }
  throw lastErr;
}

async function fetchPage(pwd_id, stoken, pdir_fid, page, size) {
  const qs = new URLSearchParams({
    pr: 'ucpro',
    fr: 'pc',
    pwd_id,
    stoken: stoken || '',
    pdir_fid,
    force: '0',
    _page: String(page),
    _size: String(size),
  });
  const url = `https://${API_HOST}${API_PATH}?${qs.toString()}`;

  let lastErr;
  for (let i = 0; i < RETRY; i++) {
    try {
      const j = await getJSON(url);
      if (j && j.data) return j;
      lastErr = new Error(j?.error_msg || j?.message || '接口返回为空');
    } catch (e) {
      lastErr = e;
    }
    await sleep(300 * (i + 1));
  }
  throw lastErr;
}

async function listAll(pwd_id, stoken, pdir_fid, size) {
  const all = [];
  let page = 1;
  while (true) {
    const j = await fetchPage(pwd_id, stoken, pdir_fid, page, size);
    const list = j.data.list || [];
    if (list.length === 0) break;
    all.push(...list);
    const total = j.data.total || 0;
    if (all.length >= total || list.length < size) break;
    page++;
    await sleep(50);
  }
  return all;
}

async function scan(pwd_id, stoken, depth, size) {
  const items = [];
  const visited = new Set(['0']);
  const queue = [{ fid: '0', path: '', depth: 0 }];

  async function worker() {
    while (queue.length) {
      const task = queue.shift();
      if (!task || task.depth > depth) continue;
      const list = await listAll(pwd_id, stoken, task.fid, size);
      for (const it of list) {
        const full = (task.path ? task.path : '') + '/' + it.file_name;
        items.push({
          path: full,
          name: it.file_name,
          size: it.size || 0,
          isFolder: !!it.dir,
          fid: it.fid,
        });
        if (it.dir && !visited.has(it.fid)) {
          visited.add(it.fid);
          queue.push({ fid: it.fid, path: full, depth: task.depth + 1 });
        }
      }
    }
  }

  const concurrency = 8;
  await Promise.all(Array.from({ length: concurrency }, worker));
  return items;
}

// ============ 构建树 ============
function buildTree(items, rootName) {
  const root = { name: rootName || '/', isFolder: true, size: 0, children: {} };
  for (const item of items) {
    const parts = item.path.split('/').filter(Boolean);
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
  function sum(node) {
    if (!node.isFolder) return node.size || 0;
    let t = 0;
    for (const k of Object.keys(node.children)) t += sum(node.children[k]);
    node.size = t;
    return t;
  }
  sum(root);
  return root;
}

function sortChildren(node) {
  return Object.keys(node.children)
    .sort((a, b) => {
      const af = node.children[a].isFolder;
      const bf = node.children[b].isFolder;
      if (af !== bf) return af ? -1 : 1;
      return a.localeCompare(b, 'zh-CN');
    })
    .map((k) => node.children[k]);
}

// ============ 格式化 ============
function formatSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

// ============ 终端颜色 ============
const RED = '\x1b[31m';
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
};
function supportsColor() {
  return process.stdout.isTTY && process.env.TERM !== 'dumb';
}
function paint(str, color) {
  return supportsColor() ? `${color}${str}${c.reset}` : str;
}

function renderColor(node, { expandAll, depthLimit }) {
  const lines = [];
  function walk(children, prefix, isTop, currentDepth) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLast = i === children.length - 1;
      const branch = isTop ? '' : isLast ? '└── ' : '├── ';
      let name = child.name;
      if (child.isFolder) name = paint(name + '/', c.yellow);
      else name = paint(name, c.reset);
      const sz = formatSize(child.size);
      const sizeStr = sz ? paint(`  (${sz})`, c.gray) : '';
      lines.push(prefix + branch + name + sizeStr);

      if (child.isFolder && Object.keys(child.children).length > 0) {
        const shouldExpand = expandAll || currentDepth < depthLimit;
        if (shouldExpand) {
          walk(
            sortChildren(child),
            prefix + (isTop ? '' : isLast ? '    ' : '│   '),
            false,
            currentDepth + 1
          );
        } else {
          const hidden = Object.keys(child.children).length;
          lines.push(
            prefix +
              (isTop ? '' : isLast ? '    ' : '│   ') +
              (isLast ? '└── ' : '├── ') +
              paint(`… (${hidden} 项，用 --depth 展开)`, c.dim)
          );
        }
      }
    }
  }
  walk(sortChildren(node), '', true, 1);
  return lines.join('\n');
}

function renderText(node, { expandAll, depthLimit }) {
  const lines = [];
  function walk(children, prefix, isTop, currentDepth) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLast = i === children.length - 1;
      const branch = isTop ? '' : isLast ? '└── ' : '├── ';
      let line = prefix + branch + child.name + (child.isFolder ? '/' : '');
      const sz = formatSize(child.size);
      if (sz) line += `  (${sz})`;
      lines.push(line);

      if (child.isFolder && Object.keys(child.children).length > 0) {
        const shouldExpand = expandAll || currentDepth < depthLimit;
        if (shouldExpand) {
          walk(
            sortChildren(child),
            prefix + (isTop ? '' : isLast ? '    ' : '│   '),
            false,
            currentDepth + 1
          );
        }
      }
    }
  }
  walk(sortChildren(node), '', true, 1);
  return lines.join('\n');
}

// ============ 导出文件 ============
function saveToFile(text, args, pwd_id, rootTitle) {
  let filePath;
  if (args.output) {
    filePath = path.resolve(args.output);
  } else {
    const safeTitle = (rootTitle || pwd_id).replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `quark目录_${safeTitle}_${date}.txt`;
    filePath = path.resolve(process.cwd(), fileName);
  }
  fs.writeFileSync(filePath, text, 'utf-8');
  return filePath;
}

// ============ 主流程 ============
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args._.length === 0) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const url = args._[0];
  const info = parseUrl(url);
  if (!info) {
    console.error(paint('✗ 无法解析分享链接，请检查是否为 pan.quark.cn/s/xxx 格式', RED));
    process.exit(1);
  }

  const { pwd_id } = info;
  console.log(paint('🔗 分享ID: ', c.gray) + pwd_id);

  let stoken = args.stoken || info.stoken;
  let rootTitle = '';

  if (!stoken) {
    console.log(paint('🔑 正在换取访问凭证 (stoken)…', c.gray));
    try {
      const result = await getStoken(pwd_id, args.passcode);
      stoken = result.stoken;
      rootTitle = result.title;
      console.log(paint('✓ 获取成功', c.gray));
      if (args.passcode) console.log(paint('🔒 使用提取码: ' + args.passcode, c.gray));
    } catch (e) {
      const msg = String(e.message || '');
      console.error(paint('✗ 换取 stoken 失败: ' + msg, RED));
      if (msg.includes('passcode') || msg.includes('提取') || msg.includes('密码')) {
        console.error(paint('  该分享需要提取码，请用 --passcode <code> 指定。', c.gray));
      } else {
        console.error(
          paint('  可尝试用浏览器打开分享页，F12 复制 stoken 后用 --stoken 指定。', c.gray)
        );
      }
      process.exit(1);
    }
  } else {
    console.log(paint('🔑 使用指定 stoken', c.gray));
  }

  const userDepth = Number.isFinite(args.depth) ? args.depth : Infinity;

  console.log(paint('⏳ 正在扫描目录树，请稍候…\n', c.gray));

  try {
    const items = await scan(pwd_id, stoken, userDepth, args.size);
    const tree = buildTree(items, rootTitle || pwd_id);

    const folderCount = items.filter((i) => i.isFolder).length;
    const fileCount = items.length - folderCount;

    const plainText = renderText(tree, {
      expandAll: args.expand && !Number.isFinite(args.depth),
      depthLimit: args.depth,
    });
    const header = `${url}\n=================================`;
    const summary =
      `\n\n共 ${items.length} 项（文件夹 ${folderCount} / 文件 ${fileCount}）` +
      (tree.size ? `\n总计: ${formatSize(tree.size)}` : '');
    const resultText = `${header}\n${plainText}${summary}`;

    if (args.json) {
      console.log(JSON.stringify(tree, null, 2));
    } else {
      const expandAll = args.expand && !Number.isFinite(args.depth);
      const renderer = supportsColor() ? renderColor : renderText;
      console.log(renderer(tree, { expandAll, depthLimit: args.depth }));
      console.log('');
      console.log(
        paint(`共 ${items.length} 项（文件夹 ${folderCount} / 文件 ${fileCount}）`, c.gray)
      );
      if (tree.size) console.log(paint(`总计: ${formatSize(tree.size)}`, c.gray));
    }

    // ===== 自动保存 txt（--json 时不导出） =====
    if (!args.json) {
      try {
        const savedPath = saveToFile(resultText, args, pwd_id, rootTitle);
        console.log(paint(`\n📄 已保存: ${savedPath}`, c.green));
      } catch (e) {
        console.error(paint(`\n✗ 保存文件失败: ${e.message}`, RED));
      }
    }
  } catch (e) {
    console.error(paint('\n✗ 导出失败: ' + e.message, RED));
    process.exit(1);
  }
}

main();
