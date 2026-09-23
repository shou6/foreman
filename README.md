# Foreman for Claude Code

[![CI](https://github.com/shou6/foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/shou6/foreman/actions/workflows/ci.yml)

[日本語](README.ja.md)

Run Claude Code sessions as tasks inside Visual Studio Code. Start them side by side and see which one is running or waiting for you. Approve tool calls and review every change turn by turn, with or without Git.

Foreman uses the `claude` CLI that is already installed and logged in on your machine. It works with your own Claude subscription (Pro / Max) or API key. You need neither a GitHub Copilot subscription nor a GitHub sign-in.

## Features

- **Tasks, not one chat**: each task is its own Claude Code session. The sidebar groups them by state: running, waiting for input, replied, failed or interrupted.
- **Task view in an editor tab**: streamed output, tool calls, follow-up prompts (Ctrl+Enter) and a model switch. Open it next to your code.
- **Approvals in the task view**: allow or deny each tool call, add a reason, or choose "always allow in this task". Questions from Claude appear as choices.
- **Diff cards without Git**: every turn shows which files changed and the line counts. Open an inline diff or the Visual Studio Code diff editor. Revert a file with one click. This works in folders that are not Git repositories.
- **Attachments**: right-click a file and choose "Foreman: Attach to Task", or drop files onto the task view (hold Shift when you drag from the editor area).
- **Notifications and status bar**: know when a task needs you or has finished. The status bar counts running and waiting tasks.
- **Persistence**: tasks, history and diff cards survive a restart. An interrupted task keeps its session, so your next prompt continues it.

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

## How it works

Foreman talks to Claude Code through the official Claude Agent SDK. Each task maps to one Claude Code session, identified by its session ID. Your Claude Code settings, permission rules and hooks apply to Foreman tasks as well. Foreman keeps task data, display history and file snapshots in the extension's workspace storage. It writes nothing into your repository.

## Known limitations

- Changes made by shell commands (not by the edit tools) show up without their previous content, so you cannot revert them from the diff card.
- A turn that was running when Visual Studio Code closed is not part of the Claude Code conversation. Foreman repeats that instruction when you continue the task.
- Your remaining subscription quota is not shown. Claude Code offers no way to read it.

## Roadmap

- Git worktrees per task for parallel work, a task board and turn-level checkpoints
- Context panel, prompt presets and one-click attachment of diagnostics and `git diff`

## License

[MIT](LICENSE)
