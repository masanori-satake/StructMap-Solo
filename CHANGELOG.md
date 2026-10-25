# 変更履歴 (Change Log)

"StructMap-Solo" 拡張機能のすべての注目すべき変更はこのファイルに記録されます。

## [1.2.1] - 2026-10-25

### 変更・最適化 (Changed / Optimized)
- Markdownパーサー (`MarkdownParser.ts`) における行スキャンのファストパス処理を追加し、大規模文書の解析速度を約60%向上

## [1.2.0] - 2026-10-25

### 追加 (Added)
- ツリービューのタイトルバーに「すべて展開（Expand All）」および「すべて集約（Collapse All）」ボタンを追加
- 配列の要素数が `maxArrayItems` を超える場合の範囲ノード（例: `[50 .. 99]`）に対する自動展開制限機能を実装（範囲ノードは折りたたんだ状態で保持）
- 一部展開／一部集約状態からの「すべて展開」および「すべて集約」操作をサポート

## [1.1.0] - 2026-10-25

### 追加 (Added)
- 配列構造の全要素表示および範囲ノード（例: `[1 .. 999]`）による分割表示をサポート
- 拡張機能設定 `structMap.maxArrayItems`（デフォルト 50）を追加し、配列要素を直接表示する上限数を設定可能に改善
- 範囲ノードを選択した際のエディタジャンプ（Jump to Node）およびツリーコピー（Copy Tree）に対応

## [1.0.2] - 2026-10-25

### 修正 (Fixed)
- 対象ファイル（Markdown、JSON、YAML 等）に応じて「Toggle Types」ボタンの有効/無効（Enable/Disable）を切り替えるように対応
- Markdown など型情報の表示に対応していないファイルを開いている場合に「Toggle Types」ボタンを無効化（グレーアウト）するよう改善

## [1.0.1] - 2026-10-25

### 修正 (Fixed)
- `.vscodeignore` による `node_modules` の誤除外を修正し、パッケージに実行時依存パッケージ（`js-yaml`）が含まれるように修正
- 拡張機能のアクティベーション失敗により `structmap-solo.refresh` 等のコマンドが見つからなくなる不具合（`command 'structmap-solo.refresh' not found`）を解消
- `activationEvents` に対象言語（`onLanguage:markdown`, `onLanguage:json`, `onLanguage:yaml`）を追加

## [1.0.0] - 2026-10-25

### 初版リリース (Initial Release)
- StructMap-Solo の初版リリース (v1.0.0)
- Markdown、JSON、YAML ファイルのツリー構造可視化（サイドバー Explorer View）
- Unicode / ASCII 罫線切り替え機能
- データ型表示（Type Mode）トグル機能
- ツリーテキストコピー機能（Copy Tree）
- ノードクリックによるエディタジャンプ機能（Node Navigation）
- リアルタイム自動更新機能（Auto Refresh）
- ローカル処理・完全プライバシー保護（No Telemetry, No Cloud, No AI）
