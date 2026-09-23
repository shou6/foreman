# Foreman for Claude Code

[![CI](https://github.com/shou6/foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/shou6/foreman/actions/workflows/ci.yml)

[日本語](README.ja.md)

Run Claude Code sessions as tasks inside Visual Studio Code. Start them side by side and see which one is running or waiting for you. Approve tool calls and review every change turn by turn, with or without Git.

Foreman uses the `claude` CLI that is already installed and logged in on your machine. It works with your own Claude subscription (Pro / Max) or API key. You need neither a GitHub Copilot subscription nor a GitHub sign-in.

> **Status:** under development. Not yet published to the Marketplace. The features below describe the first release (0.1.0).

## Features

- **Tasks, not one chat**: each task is its own Claude Code session. The sidebar groups them by state: running, waiting for input, done, failed or interrupted.
- **Task view in an editor tab**: streamed output, follow-up prompts, model switching and attachments. Open it next to your code.
- **Approvals**: allow or deny each tool call. You can also choose "always allow in this task".
- **Diff cards without Git**: every turn shows which files changed and the line counts. Open an inline diff or the Visual Studio Code diff editor. Revert a file with one click. This works in folders that are not Git repositories.
- **Notifications and status bar**: know when a task needs you or has finished.
- **Resume**: interrupted tasks keep their session. You can continue them after you restart Visual Studio Code.

## Requirements

- Visual Studio Code 1.138 or later
- [Claude Code](https://code.claude.com/docs/en/overview) installed and logged in (`claude` on your PATH, or set `foreman.claudePath`)
- A Claude subscription (Pro / Max) or an API key configured for Claude Code

Foreman never reads or stores your credentials. It launches your local `claude` CLI, which handles authentication itself.

## How it works

Foreman talks to Claude Code through the official Claude Agent SDK. Each task maps to one Claude Code session, identified by its session ID. Foreman keeps task data, display history and file snapshots in the extension's workspace storage. It writes nothing into your repository.

## Roadmap

- Git worktrees per task for parallel work, a task board and turn-level checkpoints
- Context panel, prompt presets and one-click attachment of diagnostics and `git diff`

## License

[MIT](LICENSE)
