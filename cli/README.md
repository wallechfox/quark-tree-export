# quark-tree-export CLI

夸克云盘分享目录树命令行工具（**免登录**，仅查看你有权访问的公开 / 提取码分享）。

输入分享链接，自动递归扫描并输出带文件大小的目录树，**同时自动在当前目录生成 `.txt` 文件**（格式与油猴脚本一致）。

> 上层 README 见：[../README.md](../README.md)

---

## 特性

- 🚀 **免登录**：自动 `POST sharepage/token` 换取 stoken
- 📂 **完整目录树**：默认展开全部层级，可用 `--depth` 控制
- 📏 **文件大小**：文件 / 文件夹聚合大小（自动 GB / MB / KB）
- 🎨 **终端彩色**：文件夹 / 大小分色，重定向文件自动无色
- 🔑 **支持提取码**：`--passcode`
- 🔧 **兜底模式**：`--stoken` 直接指定（油猴能开的分享都能用）
- 📝 **JSON 输出**：`--json` 便于程序处理（此时不导出 txt）
- 📄 **自动导出 txt**：运行后自动生成 `quark目录_<标题>_<日期>.txt`
- 🪶 **零依赖**：仅 Node.js 内置 `https` / `fs` / `path`

---

## 安装

### 方式一：直接运行（推荐先试）

```bash
git clone https://github.com/wallechfox/quark-tree-export.git
cd quark-tree-export/cli
node index.js "https://pan.quark.cn/s/xxxxxx"
```

需要 Node.js **>= 16**（`node -v` 检查版本）。

### 方式二：全局安装（装后可用 `quark-tree` 命令）

```bash
cd cli
npm install -g .
quark-tree "https://pan.quark.cn/s/xxxxxx" --depth 3
```

---

## 用法

```bash
# 显示帮助
node index.js

# 基本用法（自动换 stoken，展开全部层级，自动导出 txt）
node index.js "https://pan.quark.cn/s/xxxxxx"

# 控制展开层级
node index.js "https://pan.quark.cn/s/xxxxxx" --depth 3

# 折叠模式（只显示第一层）
node index.js "https://pan.quark.cn/s/xxxxxx" --no-expand

# 有提取码
node index.js "https://pan.quark.cn/s/xxxxxx" --passcode abcd

# 手动指定 stoken（跳过自动换取，最稳的兜底）
node index.js "https://pan.quark.cn/s/xxxxxx" --stoken "xxx"

# JSON 输出（不导出 txt，便于管道处理）
node index.js "https://pan.quark.cn/s/xxxxxx" --json

# 指定导出文件路径
node index.js "https://pan.quark.cn/s/xxxxxx" --output "D:\我的目录树\result.txt"
```

---

## 选项

| 选项 | 说明 | 默认 |
|------|------|------|
| `-h, --help` | 显示帮助 | — |
| `-d, --depth <n>` | 展开层级 | 全部 (Infinity) |
| `--no-expand` | 折叠，只显示第一层 | — |
| `-j, --json` | JSON 输出（此时不导出 txt） | 文本树 |
| `-s, --size <n>` | 每页数量 | 50 |
| `--stoken <token>` | 直接指定 stoken，跳过自动换取 | 自动 |
| `-p, --passcode <code>` | 分享提取码 | — |
| `-o, --output <file>` | 导出 txt 路径 | 自动生成 |

---

## 导出文件说明

- 默认保存在**运行 `node` 命令时的当前工作目录**（`process.cwd()`）
- 文件名为：`quark目录_<分享标题>_<日期>.txt`
  - 例：`quark目录_130520_最强大脑杨易思维训练营(1)_2026-09-12.txt`
- 内容：`链接 + 分隔线 + 目录树 + 统计摘要`，与油猴脚本导出格式一致
- 用 `--output` 自定义路径，如 `--output result.txt`
- 编码为 **UTF-8**（Windows 记事本可能乱码，请用 VS Code / Notepad++ / Windows Terminal 打开）

---

## 接口说明

| 接口 | 方法 | 说明 |
|------|------|------|
| `sharepage/token` | **POST** `{pwd_id, passcode}` | 换取 stoken |
| `sharepage/detail` | **GET** `?pwd_id=&stoken=&pdir_fid=` | 拉取文件列表 |

> ⚠️ 接口结构随夸克前端版本可能变动。若 `detail` 某天也改成 POST，只需把 `fetchPage` 由 `getJSON` 改为 `postJSON` 即可（参考 `getStoken` 的写法）。

---

## Windows 中文乱码

脚本已内置：

```js
process.stdout.setDefaultEncoding('utf-8');
require('child_process').execSync('chcp 65001 >nul 2>&1');
```

若终端仍乱码，请使用 **Windows Terminal** 或 **VS Code 集成终端**（不要用老式 cmd 点阵字体）。

---

## 故障排查

| 现象 | 原因 / 处理 |
|------|------------|
| `换取 stoken 失败: need passcode` | 分享有提取码 → 加 `--passcode abcd` |
| `Request method 'GET' not supported` (token) | token 必须是 POST；确认用 `postJSON`（已内置） |
| `Request method 'POST' not supported` (detail) | detail 是 GET；确认用 `getJSON`（已内置） |
| 自动换取都失败 | 浏览器打开分享页 → F12 → Network 找 `sharepage/token` → 复制 `stoken` → 用 `--stoken` 指定 |
| 扫描结果为空 | 检查分享是否失效 / 是否被删；`--depth` 是否过小 |

---

## 合规说明

仅用于查看**你自己有权访问**的公开 / 提取码分享。不破解提取码、不绕过登录、不批量抓取、不提供下载直链。请遵守夸克网盘服务协议。

## License

MIT © wallechfox
