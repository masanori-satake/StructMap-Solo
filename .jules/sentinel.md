## 2026/10/31 - JSON Pointer ($ref) 解決における Prototype Pollution / オブジェクトプロトタイプ走査防止

**Vulnerability:**
JSON Schema パーサーにおける `$ref` 解決処理（`resolveJsonPointer`）で、`part in current` によるキー存在確認および `current[part]` によるプロパティ探索を行っていたため、悪意のあるスキーマ（`$ref: "#/__proto__/..."`, `#/prototype/...`, `#/constructor/...`, `#/toString` など）に対して Object プロトタイプチェーン上の組み込みプロパティやメソッドにアクセス・走査・マージされてしまうリスクが存在した。

**Learning:**
動的オブジェクト走査を行う JSON Pointer やパス解決処理において、`in` 演算子はオブジェクト自身のプロパティだけでなくプロトタイプチェーン上の全プロパティも `true` と判定する。さらに、再帰的なオブジェクトコピーやディープマージと組み合わさった場合に Prototype Pollution や予期せぬ組み込みメソッドの露出を引き起こす可能性がある。

**Prevention:**
JSON Pointer や動的プロパティ走査処理では、必ず `__proto__`, `prototype`, `constructor` などの危険なキーをブロックした上で、`Object.prototype.hasOwnProperty.call(current, part)` を用いて自身の直接のプロパティのみを安全に探索する。

## 2026/11/02 - .env パーサーにおけるエスケープ文字を伴う引用符境界とコメント除去の安全性強化

**Vulnerability:**
.env パーサーにおいて、エスケープされた引用符（例: `\"`）で終わる未終了の文字列（`KEY="val\" # comment`）が与えられた際、末尾のエスケープされた引用符を通常の閉じ引用符と誤認し、インラインコメント境界の誤切断や不正な文字列アンエスケープが発生するリスクが存在した。

**Learning:**
引用符の有無を単純な `endsWith('"')` で判定すると、直前のバックスラッシュがエスケープ文字として機能しているケースを見落とす。また、コメント除去処理とアンエスケープ処理で異なる境界判定ロジックを使用すると、パーサー間で入力解釈の不一致（Parser Desync）が生じる原因となる。

**Prevention:**
引用符付き文字列の境界判定は共通ヘルパー関数（`extractQuotedString`）に集約し、先行する連続バックスラッシュ（エスケープ）をスキップしながら正確な閉じ引用符の位置を特定する。
