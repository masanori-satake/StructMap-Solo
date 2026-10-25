# AGENTS.md

このファイルは、本リポジトリで作業を行うAIエージェント（Jules等）向けの開発・運用ガイドラインです。

## 📌 バージョン更新およびリリースルール（必須）

本プロジェクトでは、コードやドキュメント（VSIXに含まれる全ファイル）に修正・機能拡張・不具合修正を行う際、**必ず適切なバージョン昇格（インクリメント）
を行うこと**が義務付けられています。
pre-commit フックおよび CI にてバージョン更新チェックが実行されます。

### 1. バージョン選択基準 (SemVer)
修正内容に応じて、以下の規則でバージョンを更新してください：

- **マイナーバージョン (`X.Y.Z` -> `X.(Y+1).0`)**:
  - 新機能の追加、既存機能の拡張、仕様変更などの場合
- **パッチバージョン (`X.Y.Z` -> `X.Y.(Z+1)`)**:
  - 不具合修正（バグフィックス）、軽微なUI調整、`README.md` などのパッケージ包含ドキュメントの更新の場合

※例外：`.vscode/`, `.vscode-test/`, `.github/`, `docs/`, `scripts/`, `.gitignore`,
`tsconfig.json` 等のVSIXパッケージ外の開発用設定・ドキュメントのみの更新の場合はバージョン昇格不要です。

### 2. バージョン更新手順
コードまたはドキュメントを修正したら、提出前（コミット前）に以下の関連ファイルのバージョンを一括して更新してください：
- `package.json` (`"version"`)
- `package-lock.json` (`"version"` および `"packages.[''].version"`)
- `README.md` (バッジおよび本文のバージョン表記)
- `CHANGELOG.md` (`## [X.Y.Z]` 形式のヘッダー追加)

### 3. CHANGELOG.md の記述
バージョン更新後、`CHANGELOG.md` に新しいリリース項目（`## [X.Y.Z]`）を追加し、行った変更内容の概要を**日本語**でわかりやすく記述・更新してください。

### 4. バージョンチェックの検証
提出前に、以下のコマンドでバージョン不整合および更新忘れがないか確認してください。

```bash
node scripts/check-version.js --check-bump
```

---

## 🛠 開発手順 (Development Guidelines)

### 前提条件

- Node.js (v18 以上推奨)
- npm (v9 以上推奨)
- Visual Studio Code

### ビルド & テスト手順

1. **リポジトリのクローンと依存関係のインストール**
   ```bash
   git clone https://github.com/masanori-satake/StructMap-Solo.git
   cd StructMap-Solo
   npm ci
   ```

2. **コンパイル**
   ```bash
   npm run compile
   ```

3. **コードスタイル検証 (ESLint)**
   ```bash
   npm run lint
   ```

4. **テスト実行**
   ```bash
   npm run test
   ```

5. **VSIX パッケージ生成**
   ```bash
   npm run package
   ```

### Extension Host でのデバッグ実行

1. VSCode で本プロジェクトを開きます。
2. `F5` キーを押して [Extension Development Host] を起動します。

---

## 📝 開発ルール
- テスト・ビルドの実行前に必ず必要な依存関係がインストールされていることを確認すること。
- コミットメッセージ・PRタイトル・説明文はすべて日本語で記述すること。
