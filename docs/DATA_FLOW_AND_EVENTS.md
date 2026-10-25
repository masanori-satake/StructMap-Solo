# データフローとイベントシーケンス

StructMap-Solo では、VSCode のイベントリスナー（エディタ切り替え、文書変更等）とサイドバー UI（TreeView）、コアサービス（`StructMapService`）が連動して動作します。

本ドキュメントでは、実際の操作や環境変化によって発生するイベント（ユースシーン）ごとのデータフローとシーケンスについて解説します。

---

## 目次 (Table of Contents)

- [ユースケース一覧](#ユースケース一覧)
- [UC-1: 拡張機能起動時および初期描画](#uc-1-拡張機能起動時および初期描画)
- [UC-2: アクティブエディタ切り替え時 (onDidChangeActiveTextEditor)](#uc-2-アクティブエディタ切り替え時-ondidchangeactivetexteditor)
- [UC-3: ドキュメント編集時 (onDidChangeTextDocument & Debounce)](#uc-3-ドキュメント編集時-ondidchangetextdocument--debounce)
- [UC-4: 表示オプション変更時 (型表示 / スタイル / ルート表示トグル)](#uc-4-表示オプション変更時-型表示--スタイル--ルート表示トグル)
- [UC-5: ツリーノードクリックによるエディタジャンプ (jumpToNode)](#uc-5-ツリーノードクリックによるエディタジャンプ-jumptonode)
- [UC-6: ツリー構造のテキストコピー (copyTree)](#uc-6-ツリー構造のテキストコピー-copytree)

---

## ユースケース一覧

| ID | ユースシーン | トリガーイベント / コマンド | 主な処理概要 |
| :--- | :--- | :--- | :--- |
| **UC-1** | **拡張機能起動時** | `activate(context)` | サービス初期化、`TreeDataProvider` 登録、ビュー生成、状態復元 |
| **UC-2** | **エディタ切り替え時** | `vscode.window.onDidChangeActiveTextEditor` | contextKey (`structmap.typesSupported`) 更新、自動更新設定確認、ツリー再描画 |
| **UC-3** | **ファイル編集時** | `vscode.workspace.onDidChangeTextDocument` | デバウンスタイマー (既定 500ms) 制御、タイマー発火後のツリー再描画 |
| **UC-4** | **表示トグル操作時** | `structmap-solo.toggleTypes` 等 | ViewState 更新 (`globalState` 永続化)、`refresh()` 発火による UI 再描画 |
| **UC-5** | **ノードクリック時** | `structmap-solo.jumpToNode` | ノードのパスをもとにエディタ内検索、対象位置 (Range) へカーソル移動・ハイライト |
| **UC-6** | **ツリーコピー時** | `structmap-solo.copyTree` | 全体/選択ノードを `TreeRenderer` でテキスト（Unicode/ASCII 罫線）化しクリップボードに保存 |

---

## UC-1: 拡張機能起動時および初期描画

VSCode が拡張機能をロードした際、各コンポーネントのインスタンスを生成し、`TreeView` を初期化します。

```mermaid
sequenceDiagram
    autonumber
    participant VS as VSCode Host
    participant Ext as extension.ts
    participant VSM as ViewStateManager
    participant Svc as StructMapService
    participant Nav as NodeNavigator
    participant TP as StructMapTreeProvider
    participant TV as TreeView (structmap-solo.view)

    VS->>Ext: activate(context)
    Ext->>VSM: new ViewStateManager(context)
    VSM-->>Ext: viewStateManager
    Ext->>Svc: new StructMapService()
    Svc-->>Ext: structMapService
    Ext->>Nav: new NodeNavigator()
    Nav-->>Ext: nodeNavigator

    Ext->>TP: new StructMapTreeProvider(structMapService, getActiveEditor, viewStateManager)
    TP-->>Ext: treeDataProvider

    Ext->>VS: createTreeView('structmap-solo.view', { treeDataProvider })
    VS-->>TV: TreeView インスタンス生成
    Ext->>Ext: setStructMapTreeView(treeView)
    Ext->>Ext: registerCommands(...)
    Ext->>Ext: updateTypesSupportedContext(...)

    TV->>TP: getChildren(undefined)
    TP->>Svc: build(fileName, content, maxFileSizeMB, maxArrayItems)
    Svc-->>TP: ParseResult (ParseSuccess)
    TP-->>TV: StructTreeItem[] (ルート/子ノード群)
```

---

## UC-2: アクティブエディタ切り替え時 (onDidChangeActiveTextEditor)

ユーザーがタブを切り替えてアクティブなエディタを変更した際のデータフローです。タイマーのキャンセル、データ型サポート状況のコンテキスト更新、およびツリー再描画を行います。

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant VS as VSCode Editor
    participant Ext as extension.ts
    participant TP as StructMapTreeProvider
    participant Svc as StructMapService
    participant TV as TreeView

    U->>VS: エディタタブを切り替え
    VS->>Ext: onDidChangeActiveTextEditor(editor)
    Ext->>Ext: cancelPendingRefresh() (既存デバウンスタイマー解除)
    Ext->>Svc: supportsTypes(editor.document.fileName)
    Svc-->>Ext: boolean (JSON/YAMLなら true, MDなら false)
    Ext->>VS: setContext('structmap.typesSupported', boolean)

    alt autoRefresh が有効
        Ext->>TP: refresh()
        TP->>TP: _onDidChangeTreeData.fire()
        TV->>TP: getChildren(undefined)
        TP->>Svc: build(fileName, content, ...)
        Svc-->>TP: ParseResult
        TP-->>TV: 更新された StructTreeItem[]
    else autoRefresh が無効
        Ext-->>Ext: 処理をスキップ (更新しない)
    end
```

---

## UC-3: ドキュメント編集時 (onDidChangeTextDocument & Debounce)

ファイル編集時、タイピングのたびにパースが走るのを防ぐため、デバウンス処理（デフォルト 500ms）を挟んでツリーを自動更新します。

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant VS as VSCode Text Document
    participant Ext as extension.ts
    participant Timer as Debounce Timer (setTimeout)
    participant TP as StructMapTreeProvider
    participant Svc as StructMapService
    participant TV as TreeView

    U->>VS: テキスト入力・編集
    VS->>Ext: onDidChangeTextDocument(e)
    Ext->>Ext: cancelPendingRefresh() (前回のタイマーをクリア)

    Ext->>Timer: setTimeout(callback, debounceMs [500ms])
    Note over Ext,Timer: ユーザーの連続入力中、タイマーはリセットされ続ける

    Timer-->>Ext: タイマー発火 (500ms 経過)
    Ext->>Ext: アクティブエディタおよび autoRefresh の再検証

    Ext->>TP: refresh()
    TP->>TP: _onDidChangeTreeData.fire()
    TV->>TP: getChildren(undefined)
    TP->>Svc: build(fileName, content, ...)
    Svc-->>TP: ParseResult (ParseSuccess)
    TP-->>TV: 最新構造の StructTreeItem[]
```

---

## UC-4: 表示オプション変更時 (型表示 / スタイル / ルート表示トグル)

サイドバーのタイトルバーコマンド（例: 型表示トグル `structmap-solo.toggleTypes`）が押下された際のシーケンスです。

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant Cmd as Command Handler
    participant VSM as ViewStateManager
    participant TP as StructMapTreeProvider
    participant TV as TreeView

    U->>Cmd: 「Show/Hide Node Types」ボタンをクリック
    Cmd->>VSM: toggleShowTypes()
    VSM->>VSM: ViewState 更新 & globalState.update() 永続化
    Cmd->>TP: refresh()
    TP->>TP: _onDidChangeTreeData.fire()
    TV->>TP: getChildren(undefined)
    Note over TP,TV: ViewState.showTypes を参照してノードラベルを再フォーマット
    TP-->>TV: 再フォーマットされた StructTreeItem[]
```

---

## UC-5: ツリーノードクリックによるエディタジャンプ (jumpToNode)

サイドバーの任意のノードをクリックした際、`NodeNavigator` がアクティブエディタ内をスキャンし、対象行へカーソルを移動・ハイライトします。

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant TV as TreeView
    participant Cmd as structmap-solo.jumpToNode
    participant Nav as NodeNavigator
    participant Ed as Active TextEditor

    U->>TV: ツリー項目をクリック
    TV->>Cmd: executeCommand('structmap-solo.jumpToNode', item.node)
    Cmd->>Nav: navigateToNode(editor, node)
    Nav->>Ed: editor.document.getText()
    Nav->>Nav: フォーマット別 (MD/JSON/YAML) 位置検索 (findNodePosition)
    Nav-->>Nav: Range (Start Line/Char ~ End Line/Char) 算出
    Nav->>Ed: editor.selection = selection
    Nav->>Ed: editor.revealRange(range, InCenter)
```

---

## UC-6: ツリー構造のテキストコピー (copyTree)

選択したノードまたはツリー全体をテキストとしてクリップボードへコピーする処理です。

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant Cmd as structmap-solo.copyTree
    participant TP as StructMapTreeProvider
    participant Svc as StructMapService
    participant VSM as ViewStateManager
    participant Ren as TreeRenderer
    participant Clip as vscode.env.clipboard

    U->>Cmd: 右クリックメニュー「Copy Tree」実行
    Cmd->>TP: getChildren() または選択アイテムの獲得
    Cmd->>Svc: build(fileName, content, ...)
    Svc-->>Cmd: ParseResult (StructTree)
    Cmd->>VSM: getState()
    VSM-->>Cmd: ViewState (treeStyle, showTypes, showRoot)
    Cmd->>Ren: render(tree, renderOptions)
    Ren-->>Cmd: 罫線付きツリーテキスト文字列
    Cmd->>Clip: writeText(text)
    Cmd->>U: 情報メッセージ表示 ("Tree copied to clipboard")
```
