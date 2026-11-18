<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:080B18,45:27144C,100:7C3AED&height=240&section=header&text=CLAUDE%20FREE%20CODE&fontSize=48&fontColor=FFFFFF&animation=fadeIn&fontAlignY=36&desc=Local%20Coding%20Tools%20%7C%20Node.js%20%2B%20MCP&descAlignY=59&descSize=20" alt="Claude Free Code MCP — local coding tools" />

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&size=18&duration=2800&pause=1000&color=C4B5FD&center=true&vCenter=true&width=820&height=48&lines=Explore+your+codebase.+Edit+with+confidence.;Run+approved+builds+and+tests.;Git+and+GitHub+workflows+from+Claude+Desktop.;Save+checkpoints.+Resume+when+ready." alt="Animated terminal-style feature summary" />

<p>
  <a href="https://github.com/ImIpscanning/Claude-Free-Code-MCP/actions/workflows/tests.yml"><img src="https://img.shields.io/github/actions/workflow/status/ImIpscanning/Claude-Free-Code-MCP/tests.yml?branch=main&style=for-the-badge&label=Tests" alt="GitHub Actions tests" /></a>
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 20+" />
  <img src="https://img.shields.io/badge/Version-1.0.0-7C3AED?style=for-the-badge" alt="Version 1.0.0" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-111827?style=for-the-badge" alt="MIT License" /></a>
</p>

<p>
  <img src="https://img.shields.io/badge/MCP-40%20Tools-8B5CF6?style=flat-square" alt="40 MCP tools" />
  <img src="https://img.shields.io/badge/Claude-Desktop-D97757?style=flat-square" alt="Claude Desktop" />
  <img src="https://img.shields.io/badge/Windows-Ready-0078D4?style=flat-square&logo=windows&logoColor=white" alt="Windows ready" />
  <img src="https://img.shields.io/badge/Runtime-Local%20Node.js-374151?style=flat-square" alt="Local Node.js" />
  <img src="https://img.shields.io/badge/Dependencies-0-0F766E?style=flat-square" alt="No external npm dependencies" />
</p>

**Explore. Edit. Build. Test. Resume.**

[Overview](#overview) · [Features](#features) · [Installation](#installation) · [Tools](#mcp-tool-reference) · [Dashboard](#local-approval-dashboard) · [Security](#security--limitations) · [Roadmap](#roadmap)

</div>

---

## Overview

**Claude Free Code MCP** is an open-source, **local Model Context Protocol (MCP) server** that equips Claude Desktop with practical software-development tools. It can inspect a selected workspace, search code, make controlled edits, run approved commands, work with Git and GitHub, and save progress for later conversations.

Built with **Node.js 20+**, it uses the **MCP stdio transport** and requires **no third-party npm packages**. A private browser dashboard lets you approve sensitive operations before they execute.

> [!IMPORTANT]
> **This is not official Claude Code.** It does not unlock paid Claude features, increase Free-tier usage limits, or make Claude Desktop an autonomous background agent. MCP availability depends on the Claude Desktop version and account. This local MCP server itself does not require a paid API key.

### At a glance

| Component | v1.0.0 |
|:--|:--|
| Language | JavaScript (ES modules), Node.js 20+ |
| Protocol | Local MCP over JSON-RPC stdio |
| Tools | **40** coding and workflow tools |
| Workspace | One selected project directory per instance |
| Interface | Claude Desktop + private local approval dashboard |
| Network | Not required for basic local tools; GitHub uses optional `gh` |
| Persistence | Plans, notes, snapshots, checkpoints, audit logs |
| Tests | 10 automated Node.js tests; Linux CI with Node 20 and 22 |

---

## Features

```text
Workspace exploration and bounded directory listing
Literal source-code search and glob matching
Multi-file reading and SHA-256 concurrency metadata
Create, replace, edit, move and delete project files
Preview changes and undo with guarded snapshots
Git status, diffs, history, branches, staging and commits
Optional GitHub repositories, issues and pull requests
Development tasks: test / build / lint / format / typecheck
Human-approved developer commands, PowerShell and CMD
Private local dashboard: approve, deny, trust or revoke
Project plans, notes, checkpoints and resume context
Audit trail for recent operations and permission decisions
```

### Supported workflows

| Environment | What it can do |
|:--|:--|
| Node.js / JavaScript / TypeScript | Search, edit and execute installed npm scripts |
| Python | Inspect and edit Python files, invoke installed Python tools |
| Java / Minecraft plugins | Work on Java sources and invoke Java/Maven/Gradle if installed |
| Go / Rust / .NET | Explore files and invoke installed toolchains |
| Git | Inspect changes, stage, commit and branch with approval |
| GitHub | Inspect repo/issue/PR information, create PRs via authenticated GitHub CLI |

Compilers, SDKs, Git and GitHub CLI are **not bundled**. Install the tools you need separately and ensure they are in your `PATH`.

---

## What It Is

```diff
+ A local MCP coding toolbox for Claude Desktop
+ A workspace-scoped source explorer and editor
+ A human-approved development command runner
+ A Git and optional GitHub workflow companion
+ A plan and checkpoint system to preserve context
+ A local dashboard for managing permissions
```

## What It Is Not

```diff
- Official Anthropic Claude Code
- A way to bypass subscription or message limits
- An autonomous agent running without Claude Desktop
- A guarantee that every Claude Free account supports MCP
- An operating-system sandbox for approved commands
- A replacement for backups, Git or code review
```

---

## How It Works

```text
                     Claude Desktop
                  (Free or paid plan)
                           |
                 MCP / JSON-RPC stdio
                           |
                           v
              +--------------------------+
              |    Claude Free Code MCP  |
              |       Node.js Server     |
              +--------------------------+
                           |
        +------------------+------------------+
        |                  |                  |
        v                  v                  v
  Workspace Tools     Git / Commands      Local Context
  Read / Search       Build / Tests       Plans / Notes
  Write / Undo        GitHub via gh       Checkpoints
        |                  |                  |
        +------------------+------------------+
                           |
                           v
                Permission Coordinator
                           ^
                           |
                 127.0.0.1 dashboard
                 Approve / Deny / Trust
                           |
                           v
                  Selected Workspace
```

Claude decides **when** to call tools. The MCP does not independently generate prompts or continue coding when the chat stops.

---

## Installation

### Requirements

| Component | Required? | Purpose |
|:--|:--:|:--|
| **Claude Desktop** | Yes | MCP client (tool access depends on account/version) |
| **Node.js 20+** | For manual setup | Run the local MCP server |
| **Git** | Optional | Git commands and history |
| **GitHub CLI (`gh`)** | Optional | GitHub repository/issue/PR operations |
| **Language SDKs** | Optional | Project builds and tests |
| **API key** | No | Not needed by the local MCP server |

### Method 1 — Claude Desktop extension (`.mcpb`)

If you have a compatible `.mcpb` distribution of this project:

1. Open an updated **Claude Desktop** application.
2. Go to **Settings → Desktop app → Extensions** (labels may vary).
3. Select **Install Extension** and choose the `.mcpb` file.
4. Select **only the project folder** you want Claude to work with.
5. In a Claude conversation, ask: **“Use `workspace_info` and `project_tree` to inspect my project.”**

> [!NOTE]
> The source repository contains an extension manifest, but does **not** guarantee a downloadable `.mcpb` on GitHub Releases. If you do not have a compatible package, use the manual method below.

### Method 2 — Windows / PowerShell (manual configuration)

**Clone the project:**

```powershell
git clone https://github.com/ImIpscanning/Claude-Free-Code-MCP.git
cd Claude-Free-Code-MCP
node --version
npm test
```

If Git is unavailable, choose **Code → Download ZIP** on GitHub and extract it.

**Open Claude Desktop configuration:**

```text
%APPDATA%\Claude\claude_desktop_config.json
```

**Add an MCP server entry** (replace both paths with your own):

```json
{
  "mcpServers": {
    "claude-free-code": {
      "command": "node",
      "args": [
        "C:\\Tools\\Claude-Free-Code-MCP\\src\\index.js",
        "C:\\Projects\\MyProject"
      ]
    }
  }
}
```

> [!CAUTION]
> If the config already contains other MCP servers, **merge the new entry** rather than overwriting their settings. Keep the doubled backslashes in Windows JSON paths.

Restart Claude Desktop. Ask it to call `workspace_info` to verify the connection. You can create separate entries for different workspaces.

### Manual run / diagnostics

```powershell
node src/index.js "C:\Projects\MyProject"
npm test
npm run check
```

The MCP uses **stdio**, not an interactive shell menu. Claude Desktop is the MCP client.

---

## Local Approval Dashboard

The browser dashboard is used for reviewing sensitive actions such as running programs, removing files, restoring snapshots, Git writes and PR creation.

With Claude Desktop and the MCP already running, launch:

```powershell
npm run panel
```

Open the **private URL** printed in the terminal, similar to:

```text
http://127.0.0.1:8765/?token=<your-private-token>
```

The port may change when occupied; **never share an actual dashboard link or token**.

| Decision | Result |
|:--|:--|
| **Approve once** | Allow the requested action once |
| **Deny** | Reject it without executing |
| **Trust exact request** | Remember this action and parameter signature |
| **Revoke** | Remove a saved authorization |
| **Audit** | View recent operations and approval decisions |

The dashboard is bound to **127.0.0.1**, protected by a token, and checks the origin of write requests. Approval is not an OS sandbox: commands you approve run with your account's system permissions.

---

## MCP Tool Reference

**40 tools**, organized by function:

### Workspace & Search — 6

```text
workspace_info       Show workspace, manifests and limits
project_tree        Explore a bounded folder tree
glob_files          Find files matching a pattern
search_code         Search literal code text and line numbers
read_file           Read file line ranges with SHA-256 token
read_files          Read a small batch of files
```

### Editing — 7

```text
preview_replace     Preview an exact replacement
write_file          Create or explicitly overwrite a file
replace_exact       Replace one exact occurrence
edit_lines          Apply non-overlapping line edits
make_directory      Create a folder
move_path           Move or rename with local approval
delete_path         Delete a file or empty directory with approval
```

### Undo Snapshots — 2

```text
list_snapshots      List earlier file states
restore_snapshot    Restore a snapshot with checks and approval
```

### Git — 8

```text
git_status          View working tree and current branch
git_diff            Inspect staged or unstaged diffs
git_log             View recent commits
git_branches        List local branches
git_stage           Stage selected files with approval
git_commit          Commit with approval
git_remote          View Git remotes
git_create_branch   Create/switch branch with approval
```

### GitHub — 4

```text
github_repo_view    Read repository metadata via gh
github_pr_list      List GitHub pull requests
github_issue_list   List GitHub issues
github_pr_create    Open pull request with local approval
```

GitHub integration uses your local [GitHub CLI](https://cli.github.com/) session. Install `gh` and authenticate using `gh auth login`.

### Execution — 3

```text
command_catalog     List allowed developer commands and tasks
run_task            Run a predefined development task
run_command         Run a chosen executable with argument array
```

`run_task` supports `test`, `build`, `lint`, `format`, `typecheck`, `git-status` and `git-diff`. Supported commands include Node.js, npm, Git, Python, Java, Go, Rust, .NET, PowerShell, CMD and others listed by `command_catalog`. Executions have time/output bounds and may require local approval.

### Planning & Continuity — 9

```text
plan_create         Create or replace a step-by-step plan
plan_update         Track todo / doing / done / blocked
plan_get            Read the saved plan
project_notes_read  Read persistent project notes
project_notes_write Save project conventions
checkpoint_save     Record progress and next steps
checkpoint_list     List saved checkpoints
checkpoint_read     Read a saved checkpoint
resume_context      Load plan, notes, checkpoint and Git status
```

### Audit — 1

```text
audit_recent        Inspect recent tool operations and decisions
```

---

## Example Coding Sessions

**Explore a project:**

> Use `workspace_info`, `project_tree` and `search_code` to map this repository. Explain the architecture before changing code.

**Fix a bug:**

> Locate the cause, preview your proposed change with `preview_replace`, apply the smallest edit, inspect `git_diff` and ask before running tests.

**Implement a feature:**

> Create a plan with `plan_create`. Work through the steps, verify after each one, and save a checkpoint if interrupted.

**Prepare a pull request:**

> Review `git_status` and `git_diff`, stage only the intended files, describe the commit and request approval before opening a PR.

**Resume after a Claude Free usage limit:**

Before stopping:

> Save `checkpoint_save` with finished work, blockers and next steps.

In a later conversation:

> Use `resume_context` and the latest checkpoint. Check Git status and continue from unfinished work.

Checkpoints **do not** automatically restart Claude after its quota resets. You resume the conversation manually.

---

## Project Structure

```text
Claude-Free-Code-MCP/
├── .github/workflows/
│   └── tests.yml           CI: Node 20 / 22
├── src/
│   ├── index.js            MCP server bootstrap
│   ├── mcp.js              JSON-RPC stdio transport
│   ├── tools.js            40 MCP tool handlers
│   ├── paths.js            Workspace path protections
│   ├── process.js          Process runner / task catalog
│   ├── approvals.js        Approval and trust management
│   ├── dashboard.js        Private local HTTP interface
│   ├── dashboard-link.js   Discover dashboard URLs
│   ├── storage.js          Notes, snapshots, checkpoints, audit
│   └── config.js           Limits and configuration
├── test/
│   ├── dashboard.test.js
│   ├── mcp.test.js
│   └── tools.test.js
├── manifest.json
├── package.json
├── ARCHITECTURE.md
├── SECURITY.md
├── LICENSE
└── README.md
```

See [Architecture](ARCHITECTURE.md) and [Security](SECURITY.md) for further technical details.

---

## Testing

```powershell
npm test
npm run check
```

The automated suite tests MCP initialization and calls, tool schemas, extension metadata, path checks, edits and undo, approval behavior, persistence, deletion safeguards and dashboard access.

GitHub Actions runs the checks on **Ubuntu with Node.js 20 and 22**. Automated tests cannot guarantee compatibility with all Windows and Claude Desktop versions.

[![CI Tests](https://img.shields.io/github/actions/workflow/status/ImIpscanning/Claude-Free-Code-MCP/tests.yml?branch=main&label=CI%20Tests&style=flat-square)](https://github.com/ImIpscanning/Claude-Free-Code-MCP/actions/workflows/tests.yml)

---

## Security & Limitations

- **Workspace confinement:** built-in file tools reject absolute paths, traversal, symlink escapes and direct Git-internal edits.
- **Approval:** sensitive operations can require human review in the local panel; saved permissions are revocable.
- **Undo snapshots:** restores check current hashes to reduce accidental overwrites of newer changes.
- **No OS sandbox:** approved scripts, compilers and shells may access other files or networks.
- **External execution risk:** npm scripts, Git hooks, build systems and GitHub CLI can have side effects.
- **Privacy:** MCP notes/checkpoints are stored locally, but files sent into Claude chat follow your Claude account's data settings and terms.
- **Free-tier limits:** Anthropic decides availability and usage limits for its chat and MCP features.
- **No background agent:** progress is saved, but coding does not continue unattended.

> [!WARNING]
> Select only a project folder you trust. **Do not select your entire drive or home directory.** Review every proposed command, avoid running as Administrator, and make Git commits or backups before significant edits.

See [SECURITY.md](SECURITY.md) for the complete security model.

---

## Roadmap

| Version / Phase | Focus | Status |
|:--|:--|:--|
| **v1.0.0** | 40 tools, dashboard, Git, snapshots and checkpoints | **Current** |
| **Future** | More Windows/Claude Desktop integration tests | Planned |
| **Future** | Improved diffs, rollback UX and error reporting | Proposed |
| **Future** | Optional `.mcpb` release automation | Proposed |
| **Future** | Additional per-project permission presets | Proposed |

Planned work is **not** a statement of released functionality.

---

## Technologies

<p align="center">
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/nodejs/nodejs-original.svg" width="48" height="48" alt="Node.js" />
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/javascript/javascript-original.svg" width="48" height="48" alt="JavaScript" />
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/git/git-original.svg" width="48" height="48" alt="Git" />
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/github/github-original.svg" width="48" height="48" alt="GitHub" />
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/windows11/windows11-original.svg" width="48" height="48" alt="Windows" />
</p>

---

## Contributing

Bug reports, documentation changes, test cases and pull requests are welcome. Include your OS, Node.js version, reproduction steps, expected result and observed result. **Remove secrets, tokens and private paths before sharing logs.**

## License

Distributed under the **MIT License**. See [LICENSE](LICENSE).

## Author

Developed by **[ImIpscanning](https://github.com/ImIpscanning)**.

```text
Explore.
Edit.
Build.
Test.
Resume.
```

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&size=17&duration=2600&pause=1150&color=C4B5FD&center=true&vCenter=true&width=800&height=46&lines=Thanks+for+checking+out+Claude+Free+Code+MCP.;Local+tools.+Your+projects.+Your+approvals.;Explore.+Edit.+Build.+Test.+Resume." alt="Animated closing message" />

**Claude Free Code MCP — Local Tools for Claude Desktop**

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:7C3AED,50:27144C,100:080B18&height=115&section=footer" alt="Purple gradient README footer" />

</div>