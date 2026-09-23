# Foreman for Claude Code

[![CI](https://github.com/shou6/foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/shou6/foreman/actions/workflows/ci.yml)

[English](README.md)

Claude Code のセッションを「タスク」として VS Code の中で並べて動かし、実行中か入力待ちかを一目で確かめ、ツールの実行を承認し、変更をターンごとに確認できる拡張機能。Git を使っていないフォルダでも差分を追える。

Foreman は、PC にインストール済みでログイン済みの `claude` CLI をそのまま使う。自分の Claude の契約（Pro / Max）または API キーで動き、GitHub Copilot の契約も GitHub へのサインインも要らない。

## 機能

- **チャット 1 本ではなくタスク**：1 つのタスクが 1 つの Claude Code のセッションを持つ。サイドバーでは、下書き・実行中・入力待ち・レビュー待ち・完了・失敗・中断の状態ごとに並ぶ
- **タスクボード**：サイドバーからボードを開くと、下書き・実行中・入力待ち・レビュー待ち・完了の列にタスクが並ぶ。下書きを「実行中」へドラッグすると開始し、レビュー待ちを「完了」へドラッグすると承認になる。ファイルを変えたターンは、承認するまで「レビュー待ち」に入る
- **エディタのタブに開くタスク画面**：出力の逐次表示、ツールの呼び出し、追加の指示（Ctrl+Enter）、モデルの切り替え。コードの横に並べて開ける
- **タスク画面での承認**：ツールの呼び出しごとに許可・拒否を選び、理由を添えられる。「このタスクでは常に許可」もできる。Claude からの質問は選択肢で答える
- **Git に頼らない差分カード**：各ターンで、変更されたファイルと行数を出す。インラインの差分と VS Code の差分エディタで確かめ、ファイル単位で戻せる。Git リポジトリでないフォルダでも動く
- **渡すもの**：エディタの選択範囲、問題パネルのエラーと警告、未コミットの `git diff`、ダイアログで選んだファイルを指示に添える。ファイルの右クリック「Foreman: タスクに添付」と、タスク画面へのドロップ（エディタ領域からは Shift を押しながらドラッグ）も使える
- **通知とステータスバー**：入力待ちと完了が分かる。ステータスバーに実行中と入力待ちの件数が出る
- **保存**：タスク、履歴、差分カードは再起動後も残る。中断したタスクはセッションを保ち、次の指示で続きが動く
- **git worktree**：タスクを専用の worktree とブランチで動かし、元のブランチへマージするか破棄する。worktree はリポジトリ内の `.foreman/worktrees` に置く
- **チェックポイントと切り出し**：終わったターンがそのままチェックポイントになる。ファイルだけ、またはファイルと会話をその地点に戻せる。任意のチェックポイントから新しいタスクを切り出せる。worktree のタスクは自分のブランチから切り出す
- **セカンダリサイドバーの変更とチェックポイント**：「Foreman のタスク」ビューが今見ているタスクを追い、その変更とチェックポイントを並べる
- **エクスポート**：タスクを Markdown ファイルに書き出す

## 動作環境

- Visual Studio Code 1.138 以上
- [Claude Code](https://code.claude.com/docs/en/overview) がインストール済みでログイン済みであること（`claude` が PATH にあるか、`foreman.claudePath` で指定する）
- Claude の契約（Pro / Max）または Claude Code に設定した API キー

Foreman は認証情報を読まず、保存もしない。ローカルの `claude` CLI を起動し、認証は CLI に任せる。

## 設定

| 設定 | 用途 |
| --- | --- |
| `foreman.claudePath` | `claude` の実行ファイルの場所。空なら `PATH` と `~/.local/bin` から探す |
| `foreman.defaultModel` | 新しいタスクで使うモデル（例：`claude-sonnet-5`）。空なら Claude Code の既定 |
| `foreman.defaultPermissionMode` | `default` はツールの実行のたびに確認する。`acceptEdits` はファイルの編集を自動で許可する |
| `foreman.notifications` | `all`、`waiting`、`none` のいずれか |
| `foreman.useWorktree` | Git リポジトリでタスクを作る・開始する時に「worktree で動かす」を先に選んでおく |
| `foreman.worktreeBranchPrefix` | worktree のブランチ名の接頭辞。既定は `foreman/` |
| `foreman.autoTitle` / `foreman.titleModel` | 最初の指示から小さなモデルにタスク名を付けさせる |
| `foreman.toolCalls` | タスク画面でツールの呼び出しを開いて見せるか、たたむか |
| `foreman.taskViewWidth` | タスク画面の本文の最大の幅（`em`） |
| `foreman.notificationChannel` | `both`（既定）、`vscode`、`desktop` のいずれか。デスクトップ通知は [Local Notifier](https://marketplace.visualstudio.com/items?itemName=shou6.vscode-local-notifier) 拡張機能を通す。Foreman と一緒にインストールされる（Windows のみ） |
| `foreman.settingSources` | タスクが読む Claude Code の設定。`user`、`project`、`local`。`user` を外すと個人の hooks が Foreman のタスクに効かなくなる |

## 仕組み

Foreman は公式の Claude Agent SDK を通して Claude Code と対話する。1 つのタスクが 1 つの Claude Code のセッションに対応し、セッション ID で識別する。Claude Code の設定、許可のルール、hooks は Foreman のタスクにもそのまま効く。タスクのデータ、表示用の会話の履歴、差分カード用のファイルのスナップショットは、拡張機能のワークスペース用ストレージに保存する。リポジトリの中には置かない。

## 既知の制限

- シェルのコマンドによる変更（編集ツール以外）は変更前の内容が取れないため、差分カードから戻せない
- VS Code を閉じた時に実行中だったターンは、Claude Code の会話に残らない。続きを指示する時に、Foreman がその指示を添えて送る
- サブスクの残り枠は表示しない。Claude Code に取得する手段がない

## 今後の予定

- ターンごとのトークンの使用量と、コンテキストのメーター
- Context パネル、Prompt のプリセット、診断と `git diff` のワンクリックでの添付

## ライセンス

[MIT](LICENSE)
