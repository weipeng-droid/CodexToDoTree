# CodexToDoTree

**让 Codex 的长任务变成可展开的进度树，把进展放在浏览器中，而不是刷满聊天。**

[English](README.md) · [完整执行规则](docs/AGENTS.example.md) · [分级交接手册](docs/workflow.zh-CN.md) · [协议覆盖清单](docs/workflow-coverage.md)

![纯模拟数据的任务树演示](docs/images/demo.jpg)

这是一个本机运行的 **MCP 服务 + 实时网页 + 智能体工作流规则**。一个长目标可以拆成主阶段、子阶段和更深层级；AI 遇到新问题时可以动态调整，用户能随时看到它走到哪一步。

独立社区项目，非 OpenAI 官方产品。界面目前为中文，任务内容支持任意语言。没有云端账号、遥测、API Key 或外部 CDN。

## 主要功能

- 递归树、展开折叠、搜索、键盘操作、当前执行路径和实时动画。最多 32 层，每个工作项最多 1000 个阶段。
- 一个本机服务支持多个对话页面；按真实对话 ID 隔离任务。同一对话可以有多个工作项，进行中优先，完成项默认折叠。
- 真实验收门禁：子阶段完成后，父阶段仍需自己的验证依据；不能自动把“子任务做完”说成“整体已验收”。
- 动态增补、移动、排序、改名和废弃，保留历史而不是抹掉失败步骤。
- 原子保存、SSE 实时推送、断线重连、空闲自动退出；可接入现有 `mcp-tasks` 专用 Markdown/JSON 文件。
- 可选只读同步 Codex 的项目分组和归档状态，不读取聊天正文、不写 Codex 数据库。

## 安装

需要 Node.js **22.13 或更新版本，推荐 24 LTS**，以及本机 Codex/MCP 客户端。无需管理员权限。下面使用 Git，也可以下载仓库 ZIP 并解压。

```sh
git clone https://github.com/weipeng-droid/CodexToDoTree.git
cd CodexToDoTree
npm ci
npm run setup -- --apply --codex-metadata
npm run doctor
```

1. 显式的 `setup --apply` 一次安装 **MCP 配置和完整全局 `AGENTS.md` 协议**。默认使用 `CODEX_HOME` 或标准 Codex 配置目录，保留无关原文/设置、创建本地备份，并确保指令容量充足。只运行 `npm run setup` 是预览，不会安装任何文件。
2. `--codex-metadata` 是对本机项目/归档元数据只读同步的明确选择，用于复现完整本机体验。不希望读取它时省略此选项；仍可按任务标签分组，但不能同步原生归档。升级不会因为省略参数而关闭已启用的选项；需关闭时执行 `setup --apply --no-codex-metadata`，不要手改受保护块。
3. **`doctor` 通过后才算安装内容完整**；然后重新加载 MCP 客户端、新开 Codex 运行，执行 `codex mcp list` 确认 `codex_todo_tree`。静态检查不代表模型必定遵守或侧栏必定可用。
4. 新开一个对话，输入：

> 这个任务请使用 CodexToDoTree。先读取真实 CODEX_THREAD_ID，划分 4~8 个主阶段，复杂阶段继续拆子阶段，打开本对话任务网页，并实时更新，完成后执行验证。

智能体创建计划后调用 `console_open` 获取当前对话 URL。如果客户端提供 Codex 侧边浏览器打开工具，规则会让它在当前对话右侧打开；没有这个工具就用普通浏览器。**MCP 本身不能强制所有客户端打开原生侧栏，也不会注入 Codex 界面。**

只打开网址不等于登记任务。第一次创建 `console_plan` 后才会有任务列表；新对话不会显示其他对话的任务。

全局协议现在包含：先计划再执行、真实对话隔离、递归拆解、各级父代理只管理直接子节点、实现者自测、不同代理独立复核、上级验收、退回修复、旧审查失效、中断移交和资源释放。自己的父阶段不能自行验收；当前一棵工作项树仅允许一个执行叶子，代理按交接串行协作。[完整英文协议](docs/AGENTS.example.md)是安装器与 MCP 初始化共同使用的唯一规则源，任务内容使用用户语言。MCP 返回指导不等于已经写入全局规则。

查看而不安装：`npm run setup -- --instructions`。自定义配置目录：`node bin/cli.mjs setup --apply --codex-home /absolute/profile --codex-metadata`，随后用相同 `--codex-home` 执行 `doctor`。打包安装后可将 `node bin/cli.mjs` 替换为 `codex-todo-tree`；不要误认为本项目已经发布到 npm 注册表。

官方接入方式见 [Codex MCP 文档](https://developers.openai.com/codex/mcp)。本项目不需要 OpenAI API Key。当前提供源码安装，不要把 README 当作已经在 npm 注册表发布的声明。

## 项目分组与归档同步

默认按任务提供的项目名称分组，不读取 Codex 元数据。需要与 Codex 的项目/归档同步时运行：

```sh
npm run setup -- --apply --codex-metadata
npm run doctor
```

安装器更新自己的托管配置，**不会额外登记第二份服务**。其中 `CODEX_TODO_TREE_CODEX_METADATA="1"` 打开只读同步：每 3 秒读取已登记对话的 ID、标题、归档标记和项目映射。归档后隐藏，取消归档后恢复原任务。读取失败保留最近有效数据并显示警告，不会把失败当成“全部未归档”。`doctor` 只报告选项配置，不保证当前数据库格式受支持，需在实际网页检查。

这依赖本机 Codex 版本的元数据格式，不是官方保证稳定的公共 API。更改该配置后，需要先停止本工具旧服务，再重新打开；已经运行的共享服务不会自动获得新的环境变量。无关对话与聊天正文不会被导入。

## 树与排序

```text
项目
  对话（真实 thread_id）
    工作项（稳定 board_id）
      主阶段
        子阶段
          正在执行的叶子阶段
```

同一工作项最多显式启动一个叶子，祖先状态自动汇总。子阶段全部完成后父阶段显示待验收，父阶段必须补自己的 evidence 才能完成；修改已验收子树会让相应祖先重新待验收。

不同目标创建新工作项；同一目标的排障、修复和验收放入原来的子阶段，不要每次都新增一棵树。工作项顺序：进行中、阻塞、待验收、待办、已完成、已废弃，同类最近更新优先。比例是主阶段验收数，不是预计剩余时间。

## 不使用 MCP 的 CLI

在项目目录中运行。下面 PowerShell 示例适用于 Codex 内部终端：

```powershell
node bin/cli.mjs url --thread "$env:CODEX_THREAD_ID"
node bin/cli.mjs plan --board feature --thread-title "功能开发" --title "完成新功能" --project "示例项目" --steps "检查|实现|验证|交付"
node bin/cli.mjs update --board feature --step step-1 --status in_progress
node bin/cli.mjs update --board feature --step step-1 --status done --evidence "实际执行命令与结果，退出码0"
node bin/cli.mjs add --board feature --step api --parent step-2 --title "实现接口"
node bin/cli.mjs list
```

Bash 中使用 `--thread "$CODEX_THREAD_ID"`。外部终端必须明确传入同一集成的 `--thread`，不要编造或复用别人的对话 ID。示例 evidence 是占位说明，不是真实测试结论。嵌套计划可以用 `plan --file nested-plan.json`，详见[命令参考](docs/reference.md)。

## 数据、隐私和服务释放

数据保存在当前用户的应用数据目录，而不是克隆目录或 npm 安装缓存。Windows 使用本地应用数据目录，macOS 使用 Application Support，Linux 使用 XDG 数据目录或标准后备位置。高级用户可为整套安装设置 `CODEX_TODO_TREE_STATE`；**不要每个项目或每个对话设置不同目录**。兼容旧变量 `TASK_CONSOLE_STATE`。

服务只监听 `127.0.0.1`，优先使用 47831，端口占用时选择空闲端口。网页只读；CLI/MCP 写入需要本地客户端密钥。这不是多用户权限隔离系统，能读取状态目录的本机程序仍可能读取内容。不要把秘密写进任务名称、note 或 evidence。

只要有看板保持连接就保留服务。最后一个看板关闭，且连续 60 秒没有任务查询或写入时，服务释放端口、轮询、计时器、元数据 worker 和锁；下次调用自动启动，历史保留。一个对话完成后不要停止整个共享服务。

自动打开依赖智能体首次执行任务，不代表点击历史对话就有原生打开钩子。云端/远程执行器的 localhost 不一定能从用户浏览器访问，本版优先面向同一台机器上的本机工作流；不要为了远程访问把只读接口暴露到公网。

## 开发与演示

```sh
npm ci
npm run check
npm test
npm run demo
```

`demo` 仅使用模拟任务，保存到被忽略的 `work/`，不读取真实任务。Ctrl+C 停止，或者关闭页面后等待空闲退出。界面无打包步骤，启动时固定整套资源和 build 指纹。修改代码后运行 `node bin/cli.mjs stop`、重新 `url` 并刷新一次；不要普通任务每轮都重启。

CI 配置覆盖 Windows/macOS/Linux 和 Node 22/24；配置存在不代表所有远程平台已经验收。测试包含实际 MCP/CLI/HTTP 链路、隔离、归档恢复、父子验收与资源释放。

## 卸载

仅移除 `config.toml` 中 `# CodexToDoTree BEGIN/END` 之间的块，以及全局 `AGENTS.md` 中 `<!-- CodexToDoTree BEGIN/END -->` 之间的块，保留其他设置、规则及容量字段，再重新加载客户端。其他对话不再需要时才运行 `node bin/cli.mjs stop`。删除源码不清空历史；删除历史前先备份。

## 升级、冲突与恢复

- 更新源码后运行 `npm ci`、`npm run setup -- --apply`、`npm run doctor`，再重新加载。只替换同一个托管块，不重复追加规则，保留更大的容量和已启用的元数据选项。代码升级后旧共享服务需停止/重开一次，普通任务不要反复停止。
- 从 0.1 手动安装升级：先备份配置，手动移除**仅属于本工具**的旧 `codex_todo_tree` 配置/env 段及手动加入的旧工作流，保留所有其他内容，再执行 apply。已启用的旧 `task_console` 需明确迁移或禁用；安装器拒绝冲突，不会偷偷覆盖或部署两套服务。
- 非空 `AGENTS.override.md`、无效 TOML、被修改的托管规则/配置、符号链接、残缺标记或其他安装进程持锁时明确失败。两块都有完整性摘要，托管 MCP 块内自加字段/env 不会升级时被静默丢弃，需保留后明确迁移。只处理具体冲突，不清空配置/任务数据。项目级指令也可能覆盖全局规则，需要另外核对。
- 明确配置 `[agents] enabled=false` 或零子代理额度时，doctor 会报告完整流程不可用，不擅自改用户偏好。宿主是否提供子代理/浏览器工具仍标记为未验证；缺失时必须明确降级，不能伪造审查或打开结果。
- 两种 `*.codex-todo-tree-*.bak` 备份位于用户配置目录，可能包含秘密，**绝不能上传**。恢复前比较当前文件，保留备份之后新增的无关设置。
- 安装先验证两份候选文件，再使用短锁和快照检查写入，普通失败尽可能安全回滚。锁只协调本安装器，不是所有编辑器都遵守的系统 CAS；两文件不承诺断电原子性。异常中断可能留下锁或部分安装：先确认原进程停止、比较备份和当前内容，再恢复并运行 doctor，不盲删活跃进程的锁。

不能保证任意客户端、模型、远程执行器和项目规则都具有相同能力。缺少子代理/浏览器工具必须明确降级，不伪造审查或打开结果。分级管理是工作流约束，**不是 MCP actor ACL 硬权限隔离**；证据字符串也不能独立证明命令真的执行成功。

MIT 开源，第三方依赖分别保留自己的许可。详见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
