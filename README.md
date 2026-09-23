# Foreman for Claude Code

[![CI](https://github.com/shou6/foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/shou6/foreman/actions/workflows/ci.yml)

[日本語](README.ja.md)

Run Claude Code sessions as tasks inside Visual Studio Code. Start them side by side and see which one is running or waiting for you. Approve tool calls and review every change turn by turn, with or without Git.

Foreman uses the `claude` CLI that is already installed and logged in on your machine. It works with your own Claude subscription (Pro / Max) or API key. You need neither a GitHub Copilot subscription nor a GitHub sign-in.

## Features

- **Tasks, not one chat**: each task is its own Claude Code session. The sidebar groups them by state: draft, running, waiting for input, review, done, failed or interrupted.
- **Task board**: open the board from the sidebar to see drafts, running, waiting, review and done columns. Drag a draft into "Running" to start it, or a reviewed task into "Done" to approve it. A turn that changed files lands in "Review" until you approve it.
- **Task view in an editor tab**: streamed output, tool calls, follow-up prompts (Ctrl+Enter) and a model switch. Open it next to your code.
- **Approvals in the task view**: allow or deny each tool call, add a reason, or choose "always allow in this task". Questions from Claude appear as choices.
- **Diff cards without Git**: every turn shows which files changed and the line counts. Open an inline diff or the Visual Studio Code diff editor. Revert a file with one click. This works in folders that are not Git repositories.
- **Pass along**: attach the editor selection, the errors and warnings from Problems, the uncommitted `git diff`, or files from a picker. You can also right-click a file and choose "Foreman: Attach to Task", or drop files onto the task view (hold Shift when you drag from the editor area).
- **Notifications and status bar**: know when a task needs you or has finished. The status bar counts running and waiting tasks.
- **Context meter**: the task view, the sidebar and the status bar show how much of the context window the task uses. Each turn shows its input and output tokens.
- **Persistence**: tasks, history and diff cards survive a restart. An interrupted task keeps its session, so your next prompt continues it.
- **Git worktrees**: run a task in its own worktree and branch, then merge into the branch you started from or discard it. Worktrees live in `.foreman/worktrees` inside the repository.
- **Checkpoints and forks**: every finished turn is a checkpoint. Rewind the files, or the files and the conversation, to that point. Fork a new task from any checkpoint; a worktree task forks from its own branch.
- **Changes and checkpoints in the secondary side bar**: the "Foreman Task" view follows the task you are looking at and lists its changes and checkpoints.
- **Export**: save a task as a Markdown file.

## Requirements

- Visual Studio Code 1.138 or later
- [Claude Code](https://code.claude.com/docs/en/overview) installed and logged in (`claude` on your PATH, or set `foreman.claudePath`)
- A Claude subscription (Pro / Max) or an API key configured for Claude Code

Foreman never reads or stores your credentials. It launches your local `claude` CLI, which handles authentication itself.

## Settings

| Setting | Purpose |
| --- | --- |
| `foreman.claudePath` | Path to the `claude` executable. Leave empty to search `PATH` and `~/.local/bin`. |
| `foreman.defaultModel` | Model for new tasks, for example `claude-sonnet-5`. Leave empty for the Claude Code default. |
| `foreman.defaultPermissionMode` | `default` asks before every tool call. `acceptEdits` allows file edits automatically. |
| `foreman.notifications` | `all`, `waiting` or `none`. |
| `foreman.useWorktree` | Preselect "in a worktree" when creating or starting a task in a Git repository. |
| `foreman.worktreeBranchPrefix` | Prefix for worktree branches. Default `foreman/`. |
| `foreman.autoTitle` / `foreman.titleModel` | Let a small model name new tasks from the first prompt. |
| `foreman.toolCalls` | Show tool calls expanded or collapsed in the task view. |
| `foreman.taskViewWidth` | Maximum width of the task view content, in `em`. |

## Desktop notifications

Foreman only shows Visual Studio Code notifications. For Windows desktop notifications, install [Local Notifier](https://marketplace.visualstudio.com/items?itemName=shou6.vscode-local-notifier) and add its hook command to your Claude Code settings. Foreman tasks run your Claude Code hooks, so the same setup covers tasks started from Foreman.

## How it works

Foreman talks to Claude Code through the official Claude Agent SDK. Each task maps to one Claude Code session, identified by its session ID. Your Claude Code settings, permission rules and hooks apply to Foreman tasks as well. Foreman keeps task data, display history and file snapshots in the extension's workspace storage. It writes nothing into your repository.

## Known limitations

- Changes made by shell commands (not by the edit tools) show up without their previous content, so you cannot revert them from the diff card.
- A turn that was running when Visual Studio Code closed is not part of the Claude Code conversation. Foreman repeats that instruction when you continue the task.
- Your remaining subscription quota is not shown. Claude Code offers no way to read it.

## Roadmap

- A Context panel that shows what is sent to Claude, and prompt presets
- Context panel, prompt presets and one-click attachment of diagnostics and `git diff`

## License

[MIT](LICENSE)
