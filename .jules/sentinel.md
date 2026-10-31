## 2026/10/31 - JSON Pointer ($ref) 解決における Prototype Pollution / オブジェクトプロトタイプ走査防止

**Vulnerability:**
JSON Schema パーサーにおける `$ref` 解決処理（`resolveJsonPointer`）で、`part in current` によるキー存在確認および `current[part]` によるプロパティ探索を行っていたため、悪意のあるスキーマ（`$ref: "#/__proto__/..."`, `#/prototype/...`, `#/constructor/...`, `#/toString` など）に対して Object プロトタイプチェーン上の組み込みプロパティやメソッドにアクセス・走査・マージされてしまうリスクが存在した。

**Learning:**
動的オブジェクト走査を行う JSON Pointer やパス解決処理において、`in` 演算子はオブジェクト自身のプロパティだけでなくプロトタイプチェーン上の全プロパティも `true` と判定する。さらに、再帰的なオブジェクトコピーやディープマージと組み合わさった場合に Prototype Pollution や予期せぬ組み込みメソッドの露出を引き起こす可能性がある。

**Prevention:**
JSON Pointer や動的プロパティ走査処理では、必ず `__proto__`, `prototype`, `constructor` などの危険なキーをブロックした上で、`Object.prototype.hasOwnProperty.call(current, part)` を用いて自身の直接のプロパティのみを安全に探索する。
