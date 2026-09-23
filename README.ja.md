# Foreman for Claude Code

[![CI](https://github.com/shou6/foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/shou6/foreman/actions/workflows/ci.yml)

[English](README.md)

Claude Code のセッションを「タスク」として VS Code の中で並べて動かし、実行中か入力待ちかを一目で確かめ、ツールの実行を承認し、変更をターンごとに確認できる拡張機能。Git を使っていないフォルダでも差分を追える。

Foreman は、PC にインストール済みでログイン済みの `claude` CLI をそのまま使う。自分の Claude の契約（Pro / Max）または API キーで動き、GitHub Copilot の契約も GitHub へのサインインも要らない。

> **状態：** 開発中。Marketplace にはまだ公開していない。以下の機能は最初のリリース（0.1.0）の内容。

## 機能

- **チャット 1 本ではなくタスク**：1 つのタスクが 1 つの Claude Code のセッションを持つ。サイドバーでは、実行中・入力待ち・完了・失敗・中断の状態ごとに並ぶ
- **エディタのタブに開くタスク画面**：出力の逐次表示、追加の指示、モデルの切り替え、ファイルの添付。コードの横に並べて開ける
- **承認**：ツールの呼び出しごとに許可・拒否を選ぶ。「このタスクでは常に許可」もできる
- **Git に頼らない差分カード**：各ターンで、変更されたファイルと行数を出す。インラインの差分と VS Code の差分エディタで確かめ、ファイル単位で戻せる。Git リポジトリでないフォルダでも動く
- **通知とステータスバー**：入力待ちと完了が分かる
- **再開**：中断したタスクはセッションを保ち、VS Code を開き直した後でも続きができる

## 動作環境

- Visual Studio Code 1.138 以上
- [Claude Code](https://code.claude.com/docs/en/overview) がインストール済みでログイン済みであること（`claude` が PATH にあるか、`foreman.claudePath` で指定する）
- Claude の契約（Pro / Max）または Claude Code に設定した API キー

Foreman は認証情報を読まず、保存もしない。ローカルの `claude` CLI を起動し、認証は CLI に任せる。

## 仕組み

Foreman は公式の Claude Agent SDK を通して Claude Code と対話する。1 つのタスクが 1 つの Claude Code のセッションに対応し、セッション ID で識別する。タスクのデータ、表示用の会話の履歴、差分カード用のファイルのスナップショットは、拡張機能のワークスペース用ストレージに保存する。リポジトリの中には置かない。

## 今後の予定

- タスクごとの git worktree による並列作業、タスクボード、ターン単位のチェックポイント
- Context パネル、Prompt のプリセット、診断と `git diff` のワンクリックでの添付

## ライセンス

[MIT](LICENSE)
