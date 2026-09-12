# quark-tree-export

> 免登录导出**夸克云盘分享**的目录树。提供 **Node.js CLI** 与**油猴（Tampermonkey）脚本**两个版本。

- 📂 递归扫描分享目录，输出带文件 / 文件夹大小的目录树
- 📄 一键导出为 `.txt`（格式统一，CLI 自动保存、油猴面板下载）
- 🚀 **免登录**：自动换取访问凭证（stoken）；支持提取码、支持手动指定 stoken 兜底
- 🪶 CLI 零依赖（仅 Node 内置模块），油猴单文件即可安装

---

## 目录结构

```
quark-tree-export/
├── README.md                  # 本文件
├── LICENSE                    # MIT
├── .gitignore
├── cli/                       # Node.js 命令行版本
│   ├── index.js
│   ├── package.json
│   └── README.md
└── tampermonkey/              # 浏览器油猴版本
    ├── quark-tree-export.user.js
    └── README.md
```

---

## 功能一览

| 能力 | CLI | 油猴 |
|------|:----:|:----:|
| 免登录换 stoken | ✅ | ✅ |
| 递归目录树 + 大小 | ✅ | ✅ |
| 控制展开层级 (`--depth`) | ✅ | ✅ |
| 支持提取码 | ✅ `--passcode` | ✅ 面板输入 |
| 手动指定 stoken 兜底 | ✅ `--stoken` | ✅ |
| 导出 txt | ✅ 自动保存 | ✅ 面板下载 |
| JSON 输出 | ✅ `--json` | — |
| 彩色终端 | ✅ | — |

---

## 快速开始

### 方式一：CLI（推荐批量 / 远程 / 服务器场景）

```bash
git clone https://github.com/<YOUR_GITHUB_USERNAME>/quark-tree-export.git
cd quark-tree-export/cli
node index.js "https://pan.quark.cn/s/xxxxxx"
```

需要 Node.js >= 16。更多参数见 [cli/README.md](./cli/README.md)。

全局安装后可用 `quark-tree` 命令：

```bash
cd cli && npm install -g .
quark-tree "https://pan.quark.cn/s/xxxxxx" --depth 3
```

### 方式二：油猴（推荐浏览分享页时一键使用）

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击扩展 → **添加新脚本** → 粘贴 `tampermonkey/quark-tree-export.user.js` 全文 → 保存
3. 打开任意夸克分享页 `https://pan.quark.cn/s/xxx`，右上角出现 `📂 夸克目录树` 按钮 → 点击 → 「开始导出」

更多见 [tampermonkey/README.md](./tampermonkey/README.md)。

---

## 接口说明（两个版本共用）

| 接口 | 方法 | 说明 |
|------|------|------|
| `sharepage/token` | **POST** `{pwd_id, passcode}` | 换取 stoken |
| `sharepage/detail` | **GET** `?pwd_id=&stoken=&pdir_fid=` | 拉取文件列表 |

---

## 合规说明

本工具**仅用于查看你自己有权访问的分享**，包括公开分享和你持有提取码的分享：

- ✅ 用户输入自己的提取码
- ✅ 通过官方分享页接口换取 stoken
- ✅ 不破解提取码、不绕过登录、不批量抓取、不提供下载直链

请遵守[夸克网盘服务协议](https://pan.quark.cn/)。因不当使用产生的后果由使用者自行承担。

## License

MIT © <YOUR_NAME>
