# EchoLang

> **Read the structure. Translate the meaning. Keep both.**
>
> 面向论文、报告与长文档的本地优先 AI 翻译工作台。

[![Latest Release](https://img.shields.io/github/v/release/Mu-scorpio/EchoLang?display_name=tag&sort=semver&color=2f6df6)](https://github.com/Mu-scorpio/EchoLang/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-10%2B-2f6df6?logo=windows&logoColor=white)](https://github.com/Mu-scorpio/EchoLang/releases/latest)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-1e9e74?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Release](https://img.shields.io/badge/release-v0.4.0-8b5cf6)](https://github.com/Mu-scorpio/EchoLang/releases/tag/v0.4.0)

![EchoLang 阅读工作台](docs/screenshots/echolang-reader.png)

EchoLang 不只是把文档拆成文本后逐句翻译。它尝试保留一篇文档原本的阅读结构：段落、双栏顺序、表格、图片和公式都回到它们应在的位置；翻译任务可以暂停、重试和继续，已经完成的段落会立即保存。你可以在原文、中英对照和译文之间切换，也可以把结果重新导出为适合阅读的 Word 或 PDF。

## 立即下载

前往 [GitHub Releases](https://github.com/Mu-scorpio/EchoLang/releases/latest)，按使用方式选择：

| 文件 | 适合谁 | 使用方式 |
| --- | --- | --- |
| `EchoLang-0.4.0-portable.exe` | 想立即体验的 Windows 用户 | 下载后直接运行，无需安装 Node.js |
| `EchoLang-0.4.0-setup.msi` | 希望正常安装和创建快捷方式的用户 | 双击安装，可从开始菜单或桌面启动 |
| `EchoLang-0.4.0-web-source.zip` | 想在本机、服务器或内网部署网页版本的用户 | 安装 Node.js 20+ 后运行 `npm install` 与 `npm start` |

桌面版包含 Electron、Node 运行时和文档处理依赖。API 密钥及模型配置默认保存在 `%APPDATA%\EchoLang\config.local.json`，不会写入安装目录。

## 为什么是 EchoLang

### 为真实文档准备的解析流程

- 对学术 DOCX 进行结构化解析，修复由 PDF 转 Word 常见的意外断行、断词与段落碎片。
- 识别双栏页面的阅读顺序，减少左右栏内容交错。
- 表格以单元格为翻译单位，保留表头与行列关系。
- 图片和公式参与排版但不进入翻译请求；阅读与导出时仍显示在对应位置。
- 支持 Word 公式、OMML、LaTeX 与公式图片的恢复和渲染。
- 对难以结构化的文件提供安全降级，不因为某一处复杂版式让整篇文档无法导入。

### 不会因一段失败而丢掉整篇进度

- 逐段请求、逐段落盘，刷新或重启后仍可继续。
- 自定义 RPM、最大并发数和失败重试次数。
- 单段失败会先等待重试；重试耗尽后暂时留白，其他段落继续翻译。
- 任务运行期间按钮始终绑定真实请求状态，可随时停止。
- 本轮结束后只重试未完成段落，不重复消耗已经完成的请求。
- 进度始终显示“已翻译段落 / 全文总段落”，并根据本轮平均耗时估算剩余时间。

### 一套可检查、可复现的模型工作流

- 内置多种常用模型供应商，并支持任意 OpenAI-compatible 自定义接口。
- 获取供应商模型列表、添加常用模型、设置默认模型，并可右键直接测试可用性。
- 每个“供应商 + 模型”独立保存 RPM、并发、重试、提示词与推理强度。
- 推理强度默认关闭，可选 `low`、`medium`、`high`、`xhigh`、`max`。
- 实时展示实际发送给模型的完整提示词，支持复制与审计。
- 供应商卡片支持平滑拖拽换位，排序会在本地持久化。

### 阅读，而不是检查一堆请求结果

- 原文 / 中英对照 / 翻译三种阅读模式。
- 一键互换源语言与目标语言，并带有轻量过渡动画。
- 字体、字号、行高、段落间距和内容宽度均可调整。
- 经典蓝、Claude 暖色、酒红、橙色、鼠尾草等浅色主题。
- 深色模式采用接近 GitHub Dark 的中性色阶。
- 阅读列表和批量翻译列表彼此独立，侧栏宽度可拖动调整。
- 文档完成状态只通过文件图标颜色表达，界面保持安静、克制。

### 面向交付的导出

- 导出 Word（DOCX）与 PDF 时恢复段落结构、表格、图片和公式。
- 提供适合长文阅读的 A4 版式、合理页边距、字号、行距和分页。
- 不输出内部段落编号、请求序号或解析诊断信息。
- 另支持 TXT、Markdown、HTML、JSON 与 CSV，便于后续加工或数据分析。
- 批量翻译结果可一次导出。

## 支持的文件格式

| 类型 | 导入能力 |
| --- | --- |
| DOCX | 段落、标题、双栏顺序、表格、图片、公式与版式资源 |
| PDF | 文本段落、分页信息与可识别表格；复杂扫描件取决于原文件是否包含文本层 |
| TXT / Markdown | 原生段落结构 |
| CSV / TSV / JSON | 文本与结构化内容提取 |
| HTML | 可见正文提取 |
| XLSX | 工作表与单元格文本提取 |
| PPTX | 幻灯片文本提取 |

导出格式包括 DOCX、PDF、TXT、Markdown、HTML、JSON 和 CSV。

## 快速开始：Windows 桌面版

1. 从 [最新 Release](https://github.com/Mu-scorpio/EchoLang/releases/latest) 下载 Portable 或 MSI。
2. 打开“API 设置”，选择供应商并填写 API Key。
3. 点击“获取模型列表”，添加模型并选择当前翻译模型。
4. 回到“阅读”导入文档，或进入“批量翻译”导入多个文件与文件夹。
5. 调整语言、请求参数与阅读排版后开始翻译。

如果 Windows SmartScreen 对未签名的新版本给出提示，请确认文件来自本仓库 Release 页面后选择继续运行。本项目当前发布包未使用商业代码签名证书。

## 快速开始：网页源码

要求：Node.js 20 或更高版本。

```powershell
git clone https://github.com/Mu-scorpio/EchoLang.git
cd EchoLang
npm install
Copy-Item config.example.json config.local.json
npm start
```

浏览器打开 <http://127.0.0.1:4173>。也可以直接双击根目录的 `start.bat`；如果服务已经运行，脚本会打开现有页面而不会启动第二个实例。

API Key 可以在应用界面中填写，也可以写入 `config.local.json`：

```json
{
  "provider": "opencode",
  "baseUrl": "https://opencode.ai/zen/v1",
  "model": "deepseek-v4-flash-free",
  "apiKey": "YOUR_API_KEY"
}
```

`config.local.json`、`.env` 和本地设置文件均已加入 Git 忽略规则。不要把真实密钥提交到仓库、截图或日志。

## 部署到服务器或内网

Release 中的 `web-source.zip` 是可直接部署的 Node.js 源码包：

```bash
unzip EchoLang-0.4.0-web-source.zip
cd EchoLang-0.4.0-web-source
npm ci --omit=dev
PORT=4173 node server.mjs
```

建议使用 Caddy、Nginx 或其他反向代理提供 HTTPS，并保持 Node 服务仅监听受信任网络。EchoLang 当前是本地优先的单用户工具，不自带账户系统；如果部署到公网，必须在反向代理层增加身份验证、访问控制和请求限制，并妥善保护保存 API Key 的配置目录。

## 模型请求设置

请求参数绑定到具体模型，而不是只绑定供应商。切换供应商或模型时，右侧设置会自动载入对应配置：

| 设置 | 说明 |
| --- | --- |
| 每分钟最大请求数 | 本地 RPM 限流，重试请求同样计入 |
| 最大并发请求数 | 同时处理的段落数，范围 1–20 |
| 推理强度 | 默认关闭；可选 Low、Medium、High、XHigh、Max |
| 请求提示词 | 翻译前置指令，可查看完整实际请求预览 |
| 失败最大重试次数 | 单段失败后的重试次数，耗尽后跳过该段并继续全文 |

启用推理强度时，OpenAI-compatible 请求会携带 `reasoning_effort`。不同模型和供应商支持的等级并不完全相同；如果接口返回不支持该参数，请关闭或降低推理强度。

## 本地数据与安全

- API Key 只由 Node 后端读取和保存，不进入浏览器 localStorage。
- `config.local.json`、`settings.local.json` 与 `.env*` 不会通过静态文件路由暴露。
- 文档、译文和界面设置保存在本机；翻译段落只发送到你选择的模型供应商。
- 桌面版使用隔离的 Electron 渲染进程、预加载白名单与单实例锁。
- 自定义供应商地址仅接受 HTTP 或 HTTPS URL。

请根据文档敏感程度选择可信的模型供应商，并遵守相应服务的隐私政策与数据处理条款。

## 从源码运行桌面版

```powershell
git clone https://github.com/Mu-scorpio/EchoLang.git
cd EchoLang
npm install
cd EchoLang-Desktop
npm install
npm start
```

开发模式使用上级目录的网页与后端源码。发布版则把运行所需资源放入应用目录，并使用 Electron 自带运行时启动后端。

## 构建 Windows 发布包

```powershell
cd EchoLang-Desktop
npm ci
npm run dist
```

构建产物位于 `EchoLang-Desktop/dist/`：

```text
EchoLang-0.4.0-setup.msi
EchoLang-0.4.0-portable.exe
```

单独构建某一种格式：

```powershell
npm run dist:msi
npm run dist:portable
npm run dist:dir
```

## 项目结构

```text
EchoLang/
├─ index.html                    # 阅读器、批量翻译、API 设置与应用设置界面
├─ server.mjs                    # 本地服务、导入导出、模型请求、SSE 与限流
├─ app/
│  ├─ providers.js              # 内置供应商目录
│  ├─ document-store.js         # IndexedDB 文档持久化
│  ├─ docx-extractor.mjs        # DOCX 结构、图片、公式、表格与栏布局提取
│  ├─ math-renderer.mjs         # LaTeX / OMML 公式渲染
│  └─ *.css / *.js              # 阅读设置、批量翻译、窗口与产品交互
├─ assets/                       # 本地供应商 Logo 与界面图标
├─ docs/screenshots/             # README 与 Release 截图
├─ config.example.json           # 不含真实密钥的配置模板
├─ EchoLang-Desktop/             # Electron 外壳与 Windows 打包配置
└─ start.bat                     # 单实例网页启动脚本
```

## 开发与验证

```powershell
npm install
node --check server.mjs
npm audit --omit=dev --audit-level=high

cd EchoLang-Desktop
npm install
npm run check
npm run dist:dir
```

涉及界面的改动还应在浏览器中检查阅读页、批量页、模型切换、深浅色主题和控制台；涉及解析或翻译的改动应验证 `/api/health`、`/api/extract`、`/api/translate` 与导出结果。

## v0.4.0

这是一次围绕“把文档翻译真正做成可用工具”的完整更新：

- 重构 DOCX 解析，增强双栏、意外断行、表格、图片和公式处理。
- 新增高质量 DOCX / PDF 导出，并恢复原始视觉资源。
- 阅读与批量翻译使用独立文档列表，均支持可调宽度。
- 新增应用主题与阅读排版设置，优化 GitHub 风格深色模式。
- 重新设计供应商拖拽排序、模型管理、右键测试与模型级请求参数。
- 新增模型推理强度设置。
- 翻译任务支持非阻塞段落错误、等待重试、继续翻译和绝对进度统计。
- 修复桌面与脚本重复启动服务的问题。
- Windows Release 改为 MSI 安装包 + Portable 便携版，并同时提供网页部署源码。

完整更新记录请查看 [CHANGELOG.md](CHANGELOG.md)，历史版本与二进制文件请查看 [Releases](https://github.com/Mu-scorpio/EchoLang/releases)。
