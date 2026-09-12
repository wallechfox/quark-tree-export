# quark-tree-export 油猴脚本

浏览器端目录树导出工具，配合 [../cli](../cli/) 使用。

## 安装

### 手动安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 扩展图标 → **添加新脚本**
3. 粘贴 `quark-tree-export.user.js` 全文 → Ctrl+S 保存

## 使用

1. 打开任意夸克分享页 `https://pan.quark.cn/s/xxx`
2. 右上角出现 `📂 夸克目录树` 浮动按钮 → 点击展开侧边面板
3. 点击「开始导出」→ 扫描完成后自动下载 `quark目录_xxx.txt`

## 功能

- 🔑 免登录：从分享页 `sessionStorage` 读取 pwd_id + stoken
- 📂 递归目录树，支持 `--depth` 层级控制（面板内输入）
- 📏 文件 / 文件夹聚合大小
- 📄 导出 TXT（格式与 CLI 一致），支持复制 / 下载
- 🎨 浅色主题，可折叠展开

## 合规说明

仅查看你有权访问的分享，不破解提取码、不绕过登录、不批量抓取。

## License

MIT © wallechfox
