# 変更履歴 (Change Log)

"StructMap-Solo" 拡張機能のすべての注目すべき変更はこのファイルに記録されます。

## [1.9.7] - 2026-11-22

### セキュリティ (Security)
- Applied the shared 10,000-node budget (MAX_NODES) to the TOML, XML, Markdown, and Env parsers, which previously had no expanded-node limit. Documents exceeding the budget are now rejected with a parse error, consistent with the JSON/YAML behaviour.
- Changed the TOML range node to split large arrays by recursive binary chunking (like the JSON path) instead of expanding all remaining elements as direct children.
- Replaced the per-entry linear child search in the Env parser with a Map-based index, so inserting many entries is O(n) overall instead of O(n²).
- Masked .env values in the TreeView: env-format nodes now show a fixed-length mask in the description instead of the raw value, so secrets are not exposed in screenshots or screen shares.
- Declared Workspace Trust support explicitly in package.json (`capabilities.untrustedWorkspaces.supported: "limited"`).
- 共有の 10,000 ノード予算（MAX_NODES）を、これまで展開後ノード数の上限が無かった TOML／XML／Markdown／Env パーサにも適用した。予算を超過するドキュメントは、JSON／YAML と同様にパースエラーとして拒否する。
- TOML の範囲ノードを、残り全要素を直接の子として展開する方式から、JSON 経路と同じ再帰的な二分チャンク方式に変更した。
- Env パーサのエントリごとの線形な子探索を Map ベースの索引に置き換え、挿入全体が O(n²) ではなく O(n) になった。
- TreeView での .env 値の表示をマスクした。env 形式のノードは description に生値を出さず固定長マスクを表示し、スクリーンショットや画面共有での秘密情報の露出を防ぐ。
- package.json に Workspace Trust の対応を明示宣言した（`capabilities.untrustedWorkspaces.supported: "limited"`）。

## [1.9.6] - 2026-11-20

### セキュリティ (Security)
- **展開後ノード数の上限の抜け穴を修正（PR #73 のレビュー指摘対応）**:
  - NDJSON: 文書ルートと範囲ノードも共有の 10,000 ノード予算に含めた。10,000 行の `{}`（`maxArrayItems=2`）が範囲ノードの二分木分割で約 20,000 ノードに膨らみながら成功していた問題を修正し、超過時は `NDJSON_PARSE_ERROR` を返す。上限未満の文書は引き続き成功する
  - JSON Schema: `$ref` 解決時の予算計上にプリミティブも含め、生成する StructNode ツリーにも同じ共有予算を適用した。`$defs` に 10,000 個の `true` を置き 1,000 箇所から参照する小さい入力が 1,000 万超のノードを生成できていた問題を修正し、超過時はパースエラーにする。小規模な boolean スキーマは引き続き受理する

## [1.9.5] - 2026-11-20

### セキュリティ (Security)
- **customMappings の glob 照合における ReDoS（正規表現の破滅的バックトラッキング）を修正**:
  - glob から正規表現への変換を廃止し、トークン化＋動的計画法による照合に置き換えた。ワークスペース設定由来の細工したパターン（例: `*a` を繰り返す 22 文字のパターン）でも Extension Host が固まらない
  - パターン長（512 文字）とワイルドカード数（16 個）に上限を設け、超過したパターンは無視する。コンパイル結果はキャッシュし、評価するマッピング数にも上限（256 件）を設けた
- **展開後ノード数の上限を主経路にも導入（YAML エイリアス展開・巨大ドキュメント対策）**:
  - `objectConverter`（JSON／YAML／NDJSON の変換経路）に FrontmatterParser と同じ上限 10,000 ノードを導入し、超過時はパースエラーにする。375 バイト級の YAML エイリアス爆弾（論理的には数千万ノードに展開）が Extension Host を枯渇させない
  - NDJSON は行ごとの換算ではなく文書全体で上限を数え、変換エラーも `NDJSON_PARSE_ERROR` として返すようにした
- **JSON Schema の `$ref` ダイヤモンド参照による指数的膨張を修正**:
  - 循環ガード（祖先チェーン方式）は維持したまま、解決後の総ノード数に上限 10,000 を設けた。兄弟方向に同じ定義を繰り返し参照するスキーマ（1.7KB 入力が解決後 158MB に膨張するケース）でも展開を打ち切り、パースエラーにする
- **設定値のクランプ（ワークスペース設定でサイズ保護を無効化できないように）**:
  - `structMap.maxFileSizeMB` に範囲 0.1–50 を付け、0 以下は「無制限」ではなく既定値 5MB として扱う。`structMap.maxArrayItems` は上限 1000、`structMap.debounceMs` は範囲 0–5000 を追加
  - package.json のスキーマに加え、設定の読み取り箇所とサービス入口でも同じ範囲にクランプする

## [1.9.4] - 2026-11-11

### 修正 (Fixed)
- **Markdown プレビューにフォーカスがあるとツリーのノードをクリックしてもジャンプしない問題を修正**:
  - ジャンプ先を「フォーカスのあるエディタ」ではなく、ツリーが対象としている文書で解決するようにした。プレビューでクリックや文字列選択をした後でも、ノードクリックでジャンプする
  - 対象文書のエディタが表示されている場合（ソースとプレビューの横並び表示など）はそのエディタへジャンプし、表示されていない場合（プレビューのみ表示など）はソースを横に開いてジャンプする

## [1.9.3] - 2026-11-11

### 修正 (Fixed)
- **Markdown プレビューをクリックするとツリー表示が解除される問題を修正**:
  - プレビューなどの非テキストエディタにフォーカスが移っても、最後に対象だった文書のツリーと展開状態をそのまま維持するようにした。元の文書タブに戻ったときも展開状態はリセットされない
  - プレビュー表示中でも「ツリー構造をコピー」「可視ツリー構造をコピー」「型表示の切り替え」が、維持されている対象文書に対して動作するようにした
  - 対象の文書を閉じた場合は保持を破棄し、従来通り「アクティブなエディタがありません」の表示に戻る。別の対応ファイルを開いた場合の切り替えや、対応外ファイルを開いた場合の表示は従来通り

## [1.9.2] - 2026-11-09

### セキュリティ (Security)
- **XML パーサーにおける DOCTYPE 内部サブセットの終端判定および境界処理の堅牢化**:
  - `XmlParser` において、`<!...>` 宣言（DOCTYPE 宣言等）内の DTD 内部サブセット（`[...]`）およびクォート内の `>` を考慮して正確な終端位置を特定する `findDeclarationClosingBracket` を実装
  - 内部サブセット中のクォートやタグ定義による早期の閉じ判定を防ぎ、DTD 宣言内容の不正な要素タグ誤認（Parser Desync / 偽装ノード挿入）および未終了宣言の検出漏れを防止

## [1.9.1] - 2026-11-07

### 変更 (Changed)
- **アイコンを変更**: MeetDock-Solo のデザイン言語（角アールの四角形、横線・縦線を滑らかにつないだ白線、黄色のアクセント1点）に統一した新アイコンに差し替えた。背骨とインデントした横バーで、1つの文書・データのアウトライン構造を表す図案。従来の紫グラデーションをやめ、シリーズの他拡張（SkillMap-Solo、SkillTrace-Solo）とも背景色・角アール・線の文法を揃えている

## [1.9.0] - 2026-11-04

### 削除 (Removed)
- **重複していた設定項目 `structMapSolo.customMappings` を削除**:
  - `structMap.customMappings` と同一定義の重複項目が設定画面に並んでいたものを解消し、`structMap.*` への一本化を行った
  - コード側に残っていた `structMapSolo` へのフォールバック読みもあわせて削除した（`structMap` 側にデフォルト値があるため実質的には機能していなかった互換措置の整理）
  - `settings.json` に `structMapSolo.customMappings` を記述している場合は、今後は `structMap.customMappings` への移行が必要

## [1.8.1] - 2026-11-02

### セキュリティ (Security)
- **Env パーサーの引用符境界判定およびコメント除去の堅牢化**:
  - `EnvParser` において、エスケープされた引用符（`\"`）を含む値や未終了引用符の境界判定を共通ヘルパー（`extractQuotedString`）に集約
  - 未終了文字列や末尾エスケープ付き引用符に対する誤った閉じ引用符判定および不適切なコメント切断・アンエスケープを防止

## [1.8.0] - 2026-11-02

### 追加 (Added)
- **NDJSON (Newline Delimited JSON) フォーマットサポート**:
  - 改行区切り JSON（`.ndjson`, `.jsonl`）の各行を独立してパースし、`Line <物理行番号>` 形式でツリー表示する軽量・ゼロ依存パーサー（`NdjsonParser`）を実装
  - 大量行データに対応する配列同様の Chunking 機能（`maxArrayItems` に基づく `[Line 1 .. Line 50]` 形式の範囲ノード化）をサポート
  - 構文エラー発生行を特定した `NDJSON_PARSE_ERROR` の伝播および多言語エラー表示
  - `NodeNavigator` による NDJSON 行およびプロパティ位置へのジャンプに対応
- **Env (.env / Dotfile) フォーマットサポート**:
  - `.env`, `.env.*`（例: `.env.local`, `.env.production`）の設定ファイル解析に対応したゼロ依存パーサー（`EnvParser`）を実装
  - キーのプレフィックス（アンダースコア `_` またはドット `.` 区切り）に基づく再帰的な自動グループ化・階層化表示
  - 引用符（`"..."`, `'...'`）のアンエスケープ処理および型推論（number, boolean, null, string）に対応
  - `NodeNavigator` による Env キーへのジャンプに対応

## [1.7.3] - 2026-11-01

### 修正 (Fixed)
- **「可視ツリー構造をコピー」でカスタムマッピングが反映されない不具合を修正**:
  - `structmap-solo.copyVisibleTree` が `structMap.customMappings` の設定をパーサーに渡しておらず、カスタムマッピングで紐付けたファイルを正しく解析できない問題を修正
  - 「ツリー構造をコピー」と「可視ツリー構造をコピー」の両方がカスタムマッピングを使うことを確認するテストを追加

### 変更 (Changed)
- **パッケージ作成時の重複した Lint 実行を削減**:
  - `vscode:prepublish` をビルド（`tsc -p ./`）のみに変更。Lint・型チェック・版チェックは `npm test` の `pretest` で 1 回だけ実行し、リリース時の Lint 実行回数を 2 回から 1 回に削減

## [1.7.2] - 2026-11-01

### 変更 (Changed)
- **README.md の構成を MeetDock-Solo と統一**:
  - バッジを Version / Marketplace / Open VSX / GitHub Release の4種に揃え、バッジ直下のロゴ画像を削除
  - 目次、インストール/アップデート方法、使い方、コマンド一覧表、設定一覧表、動作要件、開発者向けドキュメントの各セクションを追加
  - 見出しに絵文字を付与し、日本語側の見出しを日本語のみに統一
  - スクリーンショットを日本語セクションにも掲載
- **言語切り替えリンクのアンカーを修正**:
  - `<a name="...">` を `<a id="...">` に変更し、アンカー名を ASCII（`english` / `japanese`）に変更
  - 目次の各見出しにも ASCII の ID（`en-*` / `ja-*`）を付与し、目次のリンク先を変更
- **README のアンカーチェックスクリプトを追加**:
  - `scripts/check-readme-anchors.js` を追加し、`##` / `###` 見出しへの ID 付け忘れ、目次リンク先の不一致、ID の重複を検出
  - `npm run lint`（CI）および pre-commit フック（`scripts/run-pre-commit-check.sh`）から実行

## [1.7.1] - 2026-11-01

### 修正 (Fixed)
- **VSIX パッケージから不要なファイルを除外**:
  - `.vscodeignore` を見直し、テストコード（`__tests__/`）、ソースマップ（`*.map`）、AI エージェント関連ファイル（`AGENTS.md`、`.jules/`、`.agents/`、`.kilo/`）、アイコンの元データ（`assets/icon.svg`）を同梱しないよう変更
- **開発用依存関係の脆弱性を修正**:
  - `npm audit fix` により `@azure/msal-node` / `@azure/identity`（`@vscode/vsce` 経由、high）を修正版へ更新
  - 拡張機能本体の動作に影響する依存関係の変更はなし

## [1.7.0] - 2026-11-01

### 変更 (Changed)
- **CI/CD ワークフローの共通化**:
  - 単一の `build-and-publish.yml` を廃止し、`masanori-satake/common-workflows` の再利用可能ワークフローを呼び出す構成へ移行
  - `code-quality.yml`（`base-ci-vscode.yml` 呼び出し: 版チェック・Lint・テスト・ビルド）を追加
  - `release-package.yml`（`base-release-vscode.yml` 呼び出し: 手動実行による VSIX 再生成と Marketplace / Open VSX / GitHub Release への公開）を追加
  - `security-scan.yml`（`base-security.yml` 呼び出し: `package.json` / `package-lock.json` の脆弱性スキャン）を新規導入
- **npm スクリプトの追加・統一**:
  - `check-version`、`check-version-bump`、`update-version`、`check-types`（`tsc --noEmit`）を追加
  - `compile` および `pretest` で `check-version` → `check-types` → `lint` → `tsc -p ./` を順に実行するよう変更（`package`（`vsce package`）は `vscode:prepublish` 経由で `compile` の検証を実行）
  - バージョン一括更新スクリプト `scripts/update-version.js` を共通テンプレートから導入

## [1.6.2] - 2026-11-01

### ドキュメント (Documentation)
- **README.md の多言語化対応**:
  - 英語圏ユーザー向けに README.md を多言語構成（英語・日本語）へと刷新
  - 英語セクションを上部に配置し、言語切り替えナビゲーションを追加
  - 各種機能説明、利用例、プライバシーポリシー等の英語記述を追加

## [1.6.1] - 2026-11-01

### ドキュメント (Documentation)
- **README.md の更新**:
  - 対応フォーマットおよび型表示（Type Mode）の説明に XML、TOML、JSON Schema を追加
  - 設定およびコマンドに関する概要セクションを追加
  - ロードマップから完了済みの TOML サポート項目を削除
- **設計ドキュメント (`docs/`) の最新化**:
  - `docs/ARCHITECTURE.md`, `docs/DATA_MODEL_AND_PARSERS.md`, `docs/VIEWSTATE_AND_CONFIG.md`, `docs/ADDING_NEW_FORMAT.md` において、実装済み機能（XML, TOML, JSON Schema, カスタムマッピング）との記述乖離を解消

## [1.6.0] - 2026-10-31

### 追加 (Added)
- **TOML フォーマットサポート**:
  - 外部依存ゼロ（Vanilla TS/JS）の安全で決定論的な TOML パーサー（`TomlParser`, `parseTomlToStructNode`）を実装
  - テーブル（`[table]`）、ネストしたテーブル、テーブルの配列（`[[table]]`）、インラインテーブル、インライン配列に対応
  - `NodeNavigator` による TOML セクションおよびキー位置へのジャンプに対応
- **カスタムマッピング（settings.json）連携**:
  - `structMap.customMappings` および `structMapSolo.customMappings` のデフォルト設定に `"*.toml": "toml"` を統合
  - `StructMapService` での TOML 自動拡張子・カスタムマッピングルーティングおよび型表示（`supportsTypes`）対応

## [1.5.1] - 2026-10-31

### セキュリティ (Security)
- JSON Schema パーサーの `$ref` ポインター解決（`resolveJsonPointer`）において、`__proto__`, `prototype`, `constructor` 等のプロトタイププロパティへの走査防止および `Object.prototype.hasOwnProperty` による厳格なプロパティ検証を追加し、Prototype Pollution および意図しない組み込みプロパティ走査を防止

## [1.5.0] - 2026-10-31

### 追加 (Added)
- JSON Schema フォーマットの構造解析およびツリー表示サポートを追加
- ルートプロパティの `$schema`, `properties`, `definitions`, `$defs` に基づく JSON と JSON Schema の自動識別を実装
- `$ref` ポインターのインライン展開および参照元メタデータバッジ（`🔗 [Ref: ...]`）の付与に対応
- 祖先チェーン追跡による循環参照ガード（`[Circular Reference]`）を実装し、無限ループ・スタックオーバーフローを防止
- `definitions` / `$defs` を専用ルートグループ（`[Definitions]`）へ集約、および `oneOf` などの複合型インデックス展開に対応
- settings.json での汎用カスタムマッピング設定（`structMap.customMappings`）を追加し、任意のグロブパターン（例: `*_config.json`, `*.xlf`）と各フォーマット（JSON, YAML, XML, Markdown, JSON Schema）の紐付けに対応

## [1.4.0] - 2026-10-31

### 追加 (Added)
- XML フォーマット (`.xml`) の構造解析およびツリー表示サポートを追加
- 外部ライブラリ非依存（Vanilla JS）の軽量な XML パーサー / トークナイザーを実装
- XML タグ属性の保持・TreeView への表示（`@attr`）およびテキストノードの決定論的マッピングに対応
- XML ドキュメントにおける型情報表示（Toggle Types）およびノードクリックによるエディタジャンプ（Node Navigation）に対応

## [1.3.1] - 2026-10-30

### 追加 (Added)
- Open VSX Registry への自動パブリッシュ（`npx ovsx publish`）対応を CI ワークフローに追加

## [1.3.0] - 2026-10-26

### 追加 (Added)
- 「可視ツリー構造をコピー（Copy Visible Tree）」コマンド (`structmap-solo.copyVisibleTree`) を追加
- TreeView で現在展開されている可視ノードのみを対象としてツリー構造テキスト（Unicode/ASCII罫線）をクリップボードにコピーする機能を実装

## [1.2.3] - 2026-10-26

### 変更・最適化 (Changed / Optimized)
- NodeNavigator (`NodeNavigator.ts`) における Markdown・YAML の行スキャンおよびインデント計算にファストパス文字チェックを適用し、大容量ドキュメントでのツリージャンプ処理速度を大幅に向上

## [1.2.2] - 2026-10-26

### 修正 (Fixed)
- パッチバージョンを `1.2.2` に更新
- CI ワークフロー (`build-and-publish.yml`) のビルドジョブにバージョン昇格チェックステップを追加し、VSIX 包含ファイルの更新時におけるバージョン昇格漏れを自動検知するよう改善

## [1.2.1] - 2026-10-25

### 変更・最適化 (Changed / Optimized)
- Markdownパーサー (`MarkdownParser.ts`) における行スキャンのファストパス処理を追加し、大規模文書の解析時間を約31%短縮

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
