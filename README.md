# StructMap-Solo

StructMap-Solo は、Markdown / JSON / YAML の構造可視化を提供する Local-First、Privacy-First な VSCode 拡張機能です。

## 特長

- **Local First**: すべての処理をローカル環境で実行
- **Privacy First**: 外部へのデータ送信を行いません
- **AI機能なし**: シンプルで決定論的な構造可視化
- **構造可視化**: Markdown / JSON / YAML ファイルに対応

## 開発環境セットアップ

### 前提条件

- Node.js (v18 以上推奨)
- npm (v9 以上推奨)
- Visual Studio Code

### インストール

依存パッケージをインストールします。

```bash
npm install
```

### ビルドスクリプト

- **コンパイル**: TypeScript ソースコードをビルドします。
  ```bash
  npm run compile
  ```
- **ウォッチモード**: ファイル変更時に自動的に再ビルドを行います。
  ```bash
  npm run watch
  ```
- **ESLint 実行**: コードの静的解析を実行します。
  ```bash
  npm run lint
  ```
- **テスト実行**: 拡張機能のユニットテストおよび統合テストを実行します。
  ```bash
  npm run test
  ```
- **VSIX パッケージング**: `.vsix` パッケージファイルを生成します。
  ```bash
  npm run package
  ```

### デバッグ実行 (VSCode Extension Host)

1. VSCode で本プロジェクトのルートディレクトリを開きます。
2. キーボードの **F5** キーを押すか、デバッグタブから「Extension Host」を選択して実行します。
3. 新しい VSCode ウィンドウ（[Extension Development Host]）が起動し、開発中の拡張機能が読み込まれます。

## ディレクトリ構成

```text
src/
├─ core/       # コアロジック (Markdown / JSON / YAML 解析等)
├─ vscode/     # VSCode UI 統合・連携処理
├─ test/       # テストコード
└─ extension.ts # 拡張機能のエントリーポイント
```

## ライセンス

[MIT License](LICENSE)
