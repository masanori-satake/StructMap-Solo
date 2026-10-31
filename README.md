# StructMap-Solo

[![Version](https://img.shields.io/badge/version-v1.6.2-blue.svg)](package.json)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/masanori-satake/StructMap-Solo)](https://github.com/masanori-satake/StructMap-Solo/releases)

<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="StructMap-Solo Logo" />
</p>

<p align="center">
  <strong>Language / 言語:</strong> <a href="#english">English</a> | <a href="#japanese-日本語">日本語</a>
</p>

---

<a name="english"></a>
## English

StructMap-Solo is a Visual Studio Code extension that intuitively visualizes the document and hierarchical structure of Markdown, JSON, YAML, XML, TOML, and JSON Schema files directly in your Explorer View sidebar.

![StructMap View Screenshot](docs/screenshot.png)

---

### Overview

As documents and configuration files grow larger and more complex, understanding their overall structure and accessing specific nodes or headings becomes challenging.
**StructMap-Solo** resolves this issue by parsing active files in real time, enabling you to interactively view and navigate object trees and document outlines.

---

### Features

- **Local First**: All parsing and rendering processes run entirely on your local machine.
- **Privacy First**: Zero telemetry, zero external network calls. Your data remains completely private.
- **No AI**: Provides fast, deterministic, and highly accurate structure visualization without relying on AI services.
- **No External Services**: Zero dependencies on cloud APIs or third-party web services.

---

### Supported Formats

- **Markdown** (`.md`, `.markdown`)
- **Markdown + Frontmatter** (Markdown with YAML Frontmatter)
- **JSON** (`.json`)
- **JSON Schema** (Auto-detection for `.json`, `$ref` inline expansion, circular reference protection, `[Definitions]` grouping)
- **YAML** (`.yml`, `.yaml`)
- **XML** (`.xml`)
- **TOML** (`.toml`)
- **Custom Mappings** (Bind any custom file extension, prefix, or suffix via `structMap.customMappings` in `settings.json`)

---

### Examples

#### Markdown
```markdown
# Project
## Design
### Database
```
**StructMap View:**
```text
Project
└─ Design
   └─ Database
```

#### JSON
```json
{
  "users": []
}
```
**StructMap View:**
```text
users []
```

---

### Key Functions

- **TreeView**: Displays real-time document structure in the sidebar for the active editor file.
- **Expand All / Collapse All**: Bulk expand or collapse tree nodes (auto-expansion is safely limited for large arrays exceeding `maxArrayItems`).
- **Copy Tree**: Copy the entire tree or selected nodes as plain text (ASCII or Unicode branch lines) to your clipboard.
- **Unicode / ASCII Toggle**: Switch tree drawing styles between Unicode lines (`└─`, `├─`) and ASCII lines (`--`, `|--`) with a single click.
- **Type Mode Toggle**: Toggle data type visibility for supported formats (JSON, YAML, XML, TOML, JSON Schema, Frontmatter).
- **Node Navigation**: Click any node in the tree to instantly jump to the corresponding line and position in the editor.
- **Auto Refresh**: Debounced real-time automatic re-rendering upon editor changes.

---

### Settings & Commands

- **Commands**: Access tree copy, visible tree copy, expand/collapse, type toggle, and style toggle commands directly from the tree view title bar or the VSCode Command Palette.
- **Settings**: Customize auto-refresh (`structMap.autoRefresh`), debounce delay (`structMap.debounceMs`), max file size limit (`structMap.maxFileSizeMB`), array chunking threshold (`structMap.maxArrayItems`), and custom glob pattern mappings (`structMap.customMappings`) via VSCode Settings (`Ctrl+,` / `Cmd+,`).

---

### Privacy Policy

StructMap-Solo is built from the ground up with privacy and data security as top priorities:

- **All processing occurs locally.**
- **No telemetry.**
- **No cloud services.**
- **No AI features.**

Your input text and active document contents are **never** transmitted over any network.

---

### Roadmap

Planned enhancements for future releases:

- **Workspace Mode**: Overview and structural visualization across entire workspace folders or multiple files.

---

### License

[MIT License](LICENSE)

---

<a name="japanese-日本語"></a>
## Japanese (日本語)

StructMap-Solo は、Markdown、JSON、YAML、XML、TOML、JSON Schema ファイルのドキュメント構造・階層構造をサイドバー（Explorer View）で直感的に可視化する Visual Studio Code 拡張機能です。

---

### 概要

ドキュメントや設定ファイルが大規模化・複雑化すると、全体構造の把握や特定のノード・見出しへのアクセスが困難になります。
**StructMap-Solo** は、エディタで開いているファイルをリアルタイムに解析し、アウトラインやオブジェクトのツリー構造を対話的に表示・操作できるようにすることで、この課題を解決します。

---

### 特徴 (Features)

- **Local First**: すべての解析・描画処理がローカル環境で完了します。
- **Privacy First**: テレメトリや外部接続を行わず、データのプライバシーを完全に保護します。
- **No AI**: AI 機能を使用せず、高速かつ正確で決定論的な構造可視化を提供します。
- **No External Services**: 外部 API やクラウドサービスへの依存は一切ありません。

---

### 対応フォーマット

- **Markdown** (`.md`, `.markdown`)
- **Markdown + Frontmatter** (YAML Frontmatter 付き Markdown)
- **JSON** (`.json`)
- **JSON Schema** (`.json` 自動識別、`$ref` インライン展開、循環参照保護、`[Definitions]` 集約)
- **YAML** (`.yml`, `.yaml`)
- **XML** (`.xml`)
- **TOML** (`.toml`)
- **カスタムマッピング** (`settings.json` での `structMap.customMappings` による任意の拡張子・プレフィックス・サフィックスの紐付け)

---

### 利用例 (Examples)

#### Markdown
```markdown
# Project
## Design
### Database
```
**StructMap 表示:**
```text
Project
└─ Design
   └─ Database
```

#### JSON
```json
{
  "users": []
}
```
**StructMap 表示:**
```text
users []
```

---

### 機能一覧 (Key Functions)

- **TreeView (構造表示)**: エディタで開いているドキュメントの構造をリアルタイムでサイドバーに表示します。
- **Expand All / Collapse All (すべて展開・すべて集約)**: ツリーノードの一括展開・一括集約に対応（※配列要素数が `maxArrayItems` を超える場合の範囲ノード等は自動展開を制限）。
- **Copy Tree (ツリーコピー)**: 選択したノードまたはツリー全体をテキスト（ASCII または Unicode 罫線）としてクリップボードにコピーします。
- **Unicode / ASCII スタイル切り替え**: ツリー描画スタイルを Unicode 罫線（`└─`, `├─`）と ASCII 罫線（`--`, `|--`）でワンタップ切り替え可能です。
- **Type Mode (型表示トグル)**: 対応フォーマット（JSON、YAML、XML、TOML、JSON Schema、Frontmatter）のデータ型の表示/非表示を切り替えられます。
- **Node Navigation (ノードジャンプ)**: ツリー内のノードをクリックすると、エディタの対応する行・位置へ即座にカーソルが移動します。
- **Auto Refresh (自動更新)**: ドキュメントの編集内容をデバウンス処理付きでリアルタイムに自動追従・再描画します。

---

### 設定とコマンド (Settings & Commands)

- **コマンド**: ツリーコピー、可視ツリーコピー、展開・集約、型表示トグル、ツリースタイル切り替えなどのコマンドは、ツリービューのタイトルバーまたは VSCode のコマンドパレットから実行できます。
- **設定**: 自動更新（`structMap.autoRefresh`）、デバウンス時間（`structMap.debounceMs`）、最大ファイルサイズ制限（`structMap.maxFileSizeMB`）、配列要素の展開上限（`structMap.maxArrayItems`）、カスタムグロブマッピング（`structMap.customMappings`）は、VSCode の設定エディタ（`Ctrl+,` / `Cmd+,`）から変更できます。

---

### プライバシーポリシー (Privacy Policy)

StructMap-Solo はプライバシーとデータセキュリティを第一に設計されています：

- **すべての処理はローカルで完結します。**
- **テレメトリ（利用状況送信）はありません。**
- **クラウドサービス依存はありません。**
- **AI 機能は使用していません。**

入力テキストや編集中のドキュメントがネットワーク経由で送信されることは絶対にありません。

---

### ロードマップ (Roadmap)

将来のリリースに向けて以下の機能拡張を検討・予定しています：

- **Workspace Mode**: ワークスペース全体または複数ファイルの構造概要一覧表示

---

### ライセンス

[MIT License](LICENSE)
