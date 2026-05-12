# guitui

`guitui` 是一个键盘优先的 Git 终端界面工具，用于浏览仓库、查看提交、暂存变更、创建提交、编辑文件、搜索代码，并通过 OpenAI 驱动的 Git 助手理解当前工作。

## 功能

- 仓库文件浏览，支持文件预览和语法高亮。
- 跨所有分支的提交图，并高亮当前分支包含的提交。
- 结构化提交详情视图，展示元数据、分支包含关系、变更文件和按文件分组的补丁块。
- 提交流程：预览 diff、暂存文件、编写提交信息、创建提交。
- 内置类 Vim 编辑器，复用 TUI 的语法高亮能力。
- 本地问题扫描：TODO、FIXME、HACK、BUG；也可通过 `gh` 列出 GitHub issue。
- 项目搜索：优先使用 `rg`，没有时使用 JavaScript 兜底扫描。
- 基于 OpenAI Responses API 的 Git 助手，并支持 web search。
- 内置 Help 标签页，包含快捷键和工作流说明。

## 依赖要求

- Node.js 20 或更高版本。
- Git 已安装并可通过 `PATH` 访问。
- 可选：安装 `rg` 以获得更快搜索。
- 可选：安装 GitHub CLI `gh` 以读取 GitHub issue。
- 可选：设置 `OPENAI_API_KEY` 以启用 OpenAI 助手。

## 安装

```bash
npm install
```

## 运行

在当前项目中运行：

```bash
npm run start
```

指定另一个仓库：

```bash
node ./bin/guitui.js /path/to/repo
```

如果作为包安装，可以使用：

```bash
guitui /path/to/repo
```

## OpenAI 助手

启动 TUI 前设置 API key：

```bash
export OPENAI_API_KEY="sk-..."
```

也可以指定模型：

```bash
export OPENAI_MODEL="gpt-5"
```

助手会接收本地 Git 上下文，例如选中的提交、分支、状态、远端、最近提交、选中文件 diff 和提交补丁。当需要当前外部信息时，它可以使用 web search。

## 标签页

### Repository

浏览文件、预览代码、查看提交图和结构化提交详情。提交图覆盖所有分支，并高亮当前分支包含的提交。

### Commit

查看变更文件并创建提交。

- 在变更文件上按 Enter 预览 diff。
- 对同一个文件再次按 Enter 暂存该文件。
- 按 `u` 取消暂存选中文件。
- 按 `m` 编辑提交信息。
- 按 `c` 创建提交。

### Issues

如果安装并登录了 `gh`，会列出 GitHub issue。否则扫描本地文件中的 TODO、FIXME、HACK 和 BUG 标记。

### Agents

用自然语言询问当前仓库或选中提交。斜杠命令仍然在本地执行。

### Search

使用 `/search <query>` 搜索项目文件。结果会展示周围源码上下文。

### Help

显示内置使用说明和快捷键。

## 快捷键

- `1-6`：切换标签页。
- `Tab`、右方向键、`l`、`]`：下一个标签页。
- `Shift-Tab`、左方向键、`h`、`[`：上一个标签页。
- `j/k` 或方向键：在当前列表中移动。
- `b`：聚焦文件浏览器。
- `c`：在 Repository 中聚焦提交图；在 Commit 中创建提交。
- `a`：聚焦 agent 输入框。
- `Enter`：预览选中项；在 Commit 中用于预览并暂存变更文件。
- `d`：显示选中文件 diff。
- `e`：用内置编辑器编辑选中文件。
- `m`：在 Commit 标签页编辑提交信息。
- `u`：在 Commit 标签页取消暂存选中文件。
- `r`：刷新。
- `Ctrl-K` 或 `:`：聚焦命令输入框。
- `q` 或 `Ctrl-C`：退出。

可滚动详情面板支持 `j/k`、方向键、PageUp/PageDown、Ctrl-U/Ctrl-D、`g` 和 `G`。

## 命令

- `/files`：返回仓库文件浏览器。
- `/commit`：查看选中的提交。
- `/commit <hash>`：按 hash 前缀查看提交。
- `/edit`：编辑选中文件。
- `/diff`：显示选中文件 diff。
- `/refresh`：重新加载文件树和 Git 状态。
- `/open <path>`：通过完整路径或后缀匹配跳转文件。
- `/search <query>`：搜索文件内容。
- `/message <text>`：设置 Commit 标签页的提交信息。
- `/commit-create`：使用已暂存文件和当前提交信息创建提交。
- `/ignore <name>`：从文件树隐藏某个目录或文件名。
- `/unignore <name>`：从忽略列表移除某个名称。
- `git status`：打开 Commit 标签页。

## 内置编辑器

通过 `e` 或 `/edit` 打开选中文件。

- Normal 模式：`h/j/k/l` 或方向键移动，`0` 和 `$` 在行内跳转，`g` 和 `G` 跳到首行和末行。
- Normal 模式：`i` 在光标前插入，`a` 在光标后追加，`o` 新开一行，`x` 删除字符，`dd` 删除行。
- Insert 模式：正常输入，Enter 插入新行，Backspace 删除，Esc 返回 Normal 模式。
- Command 模式：`:w` 保存，`:q` 在无修改时退出，`:q!` 放弃修改，`:wq` 或 `:x` 保存并退出。

## 语法高亮

当前内置支持：

- Python：`.py`
- JavaScript 和 TypeScript：`.js`、`.jsx`、`.mjs`、`.ts`、`.tsx`
- Go：`.go`

高亮器基于注册表设计，后续可以添加语言，而不需要重写预览或编辑器渲染逻辑。

## 验证

```bash
npm run smoke
```
