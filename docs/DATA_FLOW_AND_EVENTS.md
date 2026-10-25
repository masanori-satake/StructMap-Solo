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
| **UC-2** | **エディタ切り替え時** | `vscode.window.onDidChangeActiveTextEditor` | Context Key (`structmap-solo.typesSupported`) 更新、自動更新設定確認、ツリー再描画 |
| **UC-3** | **ファイル編集時** | `vscode.workspace.onDidChangeTextDocument` | アクティブ文書検証、デバウンスタイマー (既定 500ms) 制御、ツリー再描画 |
| **UC-4** | **表示トグル操作時** | `structmap-solo.toggleTypes` 等 | ViewState 更新 (`set*` メソッド呼び出し & `globalState` 永続化)、`refresh()` 発火 |
| **UC-5** | **ノードクリック時** | `structmap-solo.jumpToNode` | `nodeNavigator.jumpToNode(editor, node)` による位置特定・カーソル移動 |
| **UC-6** | **ツリーコピー時** | `structmap-solo.copyTree` | アクティブ文書を取得し `StructMapService` でビルド、`TreeRenderer` で描画しクリップボードへ保存 |

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

ユーザーがタブを切り替えてアクティブなエディタを変更した際のデータフローです。タイマーのキャンセル、データ型サポート状況の Context Key 更新、およびツリー再描画を行います。

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
    Ext->>VS: setContext('structmap-solo.typesSupported', boolean)

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

ファイル編集時、アクティブ文書かどうかの検証、デバウンス処理（デフォルト 500ms）、および設定確認を経てツリーを更新します。

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
    alt 変更文書がアクティブ文書ではない
        Ext-->>VS: 処理終了 (スキップ)
    else 変更文書がアクティブ文書
        Ext->>Ext: cancelPendingRefresh() (前回のタイマーをクリア)
        alt autoRefresh が無効
            Ext-->>VS: 処理終了 (スキップ)
        else autoRefresh が有効
            Ext->>Timer: setTimeout(callback, debounceMs [500ms])
            Timer-->>Ext: タイマー発火 (500ms 経過)
            Ext->>Ext: アクティブ文書および autoRefresh の再検証
            alt アクティブ文書が一致し、かつ autoRefresh が有効
                Ext->>TP: refresh()
                TP->>TP: _onDidChangeTreeData.fire()
                TV->>TP: getChildren(undefined)
                TP->>Svc: build(fileName, content, ...)
                Svc-->>TP: ParseResult
                TP-->>TV: 最新構造の StructTreeItem[]
            else アクティブ文書が不一致、または autoRefresh が無効
                Ext-->>Ext: 処理終了 (スキップ)
            end
        end
    end
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

    U->>Cmd: 「Toggle Types」ボタンをクリック
    Cmd->>VSM: getState()
    VSM-->>Cmd: currentViewState
    Cmd->>VSM: setShowTypes(!currentViewState.showTypes)
    VSM->>VSM: updateState({ showTypes }) & globalState 永続化
    VSM-->>Cmd: Promise<ViewState> (updatedViewState)
    Cmd->>TP: refresh()
    TP->>TP: _onDidChangeTreeData.fire()
    TV->>TP: getChildren(undefined)
    TP-->>TV: 再フォーマットされた StructTreeItem[]
```

---

## UC-5: ツリーノードクリックによるエディタジャンプ (jumpToNode)

サイドバーの任意のノードをクリックした際、`nodeNavigator.jumpToNode(editor, node)` が呼び出され、エディタ内をスキャンして対象位置へカーソル移動・ハイライトします。

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
    Cmd->>Nav: jumpToNode(editor, node)
    Nav->>Nav: findNodePosition(document, node)
    Nav-->>Nav: Position (Line, Character) 算出
    Nav->>Ed: selection = Selection(position, position)
    Nav->>Ed: revealRange(Range, InCenter)
    Nav-->>Cmd: boolean (true: 成功 / false: 失敗)
```

---

## UC-6: ツリー構造のテキストコピー (copyTree)

アクティブなエディタからドキュメント内容を取得し、`StructMapService` と `TreeRenderer` を通じてテキスト化してクリップボードへ書き込む処理です。

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant Cmd as structmap-solo.copyTree
    participant Ed as Active TextEditor
    participant Svc as StructMapService
    participant VSM as ViewStateManager
    participant Ren as TreeRenderer
    participant Clip as vscode.env.clipboard

    U->>Cmd: コマンド実行 (copyTree)
    Cmd->>Ed: activeTextEditor.document (fileName, content 取得)
    Cmd->>Svc: build(fileName, content)
    Svc-->>Cmd: ParseResult (ParseSuccess)
    Cmd->>VSM: getState()
    VSM-->>Cmd: ViewState (treeStyle, showTypes, showRoot)
    Cmd->>Ren: render(parseResult.tree, viewState)
    Ren-->>Cmd: 罫線付きツリーテキスト文字列
    Cmd->>Clip: writeText(treeText)
    Cmd->>U: 情報メッセージ表示 ("StructMap tree copied to clipboard.")
```
