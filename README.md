# quark-tree-export

免登录导出夸克云盘分享目录树。包含：
- `cli/`：Node.js 命令行版本（零依赖，自动换 stoken）
- `tampermonkey/`：浏览器油猴版本（分享页侧边面板、TXT/Markdown 导出）

## 功能
- 自动从分享链接取 pwd_id，POST 换 stoken，GET 拉 detail
- 递归目录树、聚合文件夹大小
- CLI 支持 --depth/--no-expand/--passcode/--stoken/--json/--output
- 油猴支持面板展开、复制、下载、深浅色

## 合规说明
仅用于查看你有权访问的公开/提取码分享；不破解提取码、不绕登录、不批量抓取、不提供下载直链。

## CLI 快速开始
\`\`\`bash
cd cli
node index.js "https://pan.quark.cn/s/xxxx"
# 或全局安装
npm install -g .
quark-tree "https://pan.quark.cn/s/xxxx" --depth 3
\`\`\`

## 油猴安装
- 方式一：Greasy Fork 搜索“夸克云盘目录树导出工具”
- 方式二：Tampermonkey → 新建脚本 → 粘贴 tampermonkey/quark-tree-export.user.js
- 方式三：直接打开 GitHub raw 安装

## 接口
- sharepage/token POST {pwd_id, passcode}
- sharepage/detail GET ?pwd_id=&stoken=&pdir_fid=

## License
MIT
