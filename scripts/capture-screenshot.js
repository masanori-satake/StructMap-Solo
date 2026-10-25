const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1000, height: 650 },
    deviceScaleFactor: 2
  });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  body { background: #1e1e1e; color: #cccccc; display: flex; height: 100vh; overflow: hidden; font-size: 13px; }

  /* Activity Bar */
  .activity-bar { width: 48px; background: #333333; display: flex; flex-direction: column; align-items: center; padding-top: 10px; gap: 16px; flex-shrink: 0; }
  .activity-icon { width: 24px; height: 24px; fill: #858585; opacity: 0.8; }
  .activity-icon.active { fill: #ffffff; opacity: 1; border-left: 2px solid #ffffff; padding-left: 2px; }

  /* Sidebar */
  .sidebar { width: 320px; background: #252526; display: flex; flex-direction: column; border-right: 1px solid #333333; flex-shrink: 0; }
  .sidebar-header { padding: 10px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #bbbbbb; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center; background: #252526; border-bottom: 1px solid #2d2d2d; }

  .view-title-bar { padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #cccccc; display: flex; justify-content: space-between; align-items: center; background: #252526; border-top: 1px solid #2d2d2d; border-bottom: 1px solid #2d2d2d; }
  .view-actions { display: flex; gap: 8px; align-items: center; }
  .action-icon { width: 16px; height: 16px; fill: #c5c5c5; cursor: pointer; }

  .tree-container { padding: 6px 0; overflow-y: auto; flex: 1; }
  .tree-item { display: flex; align-items: center; padding: 3px 12px; cursor: pointer; user-select: none; font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 12px; }
  .tree-item:hover { background: #2a2d2e; }
  .tree-item.selected { background: #37373d; color: #ffffff; }
  .indent { display: inline-block; width: 16px; }
  .twistie { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; color: #c5c5c5; font-size: 10px; margin-right: 2px; }
  .node-icon { width: 16px; height: 16px; margin-right: 6px; display: inline-flex; align-items: center; justify-content: center; }
  .node-icon svg { width: 14px; height: 14px; fill: #75beff; }
  .node-icon.key svg { fill: #c586c0; }
  .node-icon.string svg { fill: #ce9178; }
  .node-icon.number svg { fill: #b5cea8; }
  .node-icon.array svg { fill: #4ec9b0; }
  .node-icon.object svg { fill: #4fc1ff; }
  .node-label { color: #cccccc; }
  .node-type { color: #6a9955; margin-left: 8px; font-size: 11px; font-style: italic; }

  /* Editor Area */
  .editor-container { flex: 1; display: flex; flex-direction: column; background: #1e1e1e; }
  .tabs-bar { height: 35px; background: #252526; display: flex; border-bottom: 1px solid #252526; }
  .tab { padding: 0 16px; height: 100%; display: flex; align-items: center; gap: 8px; background: #1e1e1e; color: #ffffff; font-size: 13px; border-top: 1px solid #007acc; border-right: 1px solid #252526; }
  .tab-icon { width: 14px; height: 14px; fill: #e5c07b; }
  .editor-body { flex: 1; padding: 12px; display: flex; font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 13px; line-height: 1.6; }
  .line-numbers { color: #858585; width: 30px; text-align: right; padding-right: 12px; user-select: none; }
  .code-content { color: #d4d4d4; flex: 1; }
  .code-line { white-space: pre; }
  .kwd { color: #569cd6; }
  .str { color: #ce9178; }
  .num { color: #b5cea8; }
  .key { color: #9cdcfe; }
  .md-h1 { color: #569cd6; font-weight: bold; }
  .md-h2 { color: #4ec9b0; font-weight: bold; }
  .md-h3 { color: #ce9178; font-weight: bold; }

  /* SVG Icons */
  .icon-copy { fill: currentColor; }
</style>
</head>
<body>

  <!-- Activity Bar -->
  <div class="activity-bar">
    <div class="activity-icon active">
      <svg viewBox="0 0 16 16"><path d="M14 1H2e1 0 0 0-1 1v12e1 0 0 0 1 1h12e1 0 0 0 1-1V2e1 0 0 0-1-1zm0 13H2V2h12v12z"/></svg>
    </div>
  </div>

  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-header">
      Explorer
    </div>

    <!-- StructMap View -->
    <div class="view-title-bar">
      <span>StructMap</span>
      <div class="view-actions" title="Copy Tree / Toggle Types / Toggle Style / Toggle Root / Refresh">
        <!-- Copy -->
        <svg class="action-icon" viewBox="0 0 16 16"><path d="M4 4v9h9V4H4zm8 8H5V5h7v7zM3 3h9v1H3v8H2V3h1z"/></svg>
        <!-- Toggle Types -->
        <svg class="action-icon" viewBox="0 0 16 16"><path d="M2 3h12v2H2V3zm0 4h12v2H2V7zm0 4h8v2H2v-2z"/></svg>
        <!-- Toggle Style -->
        <svg class="action-icon" viewBox="0 0 16 16"><path d="M3 2h10v2H3V2zm2 4h8v2H5V6zm2 4h6v2H7v-2z"/></svg>
        <!-- Refresh -->
        <svg class="action-icon" viewBox="0 0 16 16"><path d="M8 2a6 6 0 1 0 6 6h-1.5A4.5 4.5 0 1 1 8 3.5V6l3.5-3.5L8 0v2z"/></svg>
      </div>
    </div>

    <div class="tree-container">
      <!-- Root -->
      <div class="tree-item">
        <span class="twistie">▼</span>
        <span class="node-icon"><svg viewBox="0 0 16 16"><path d="M13.5 3H7.7L6.2 1.5H2.5C1.7 1.5 1 2.2 1 3v10c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V4.5c0-.8-.7-1.5-1.5-1.5z"/></svg></span>
        <span class="node-label">README.md</span>
      </div>

      <!-- Frontmatter -->
      <div class="tree-item">
        <span class="indent"></span>
        <span class="twistie">▼</span>
        <span class="node-icon object"><svg viewBox="0 0 16 16"><path d="M8 1L1 4v8l7 3 7-3V4L8 1zm0 1.5l5.2 2.2L8 7 2.8 4.7 8 2.5zM2.2 5.8L7.2 8v5.8L2.2 11.6V5.8zm6.8 8V8l5-2.2v5.8l-5 2.2z"/></svg></span>
        <span class="node-label">Frontmatter</span>
        <span class="node-type">: object</span>
      </div>

      <!-- Frontmatter item: title -->
      <div class="tree-item">
        <span class="indent"></span><span class="indent"></span>
        <span class="twistie"></span>
        <span class="node-icon key"><svg viewBox="0 0 16 16"><path d="M11 1a4 4 0 0 0-3.8 2.7L1 9.9V13h3.1l1.5-1.5H7v-1.5l1.3-1.3A4 4 0 1 0 11 1zm0 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg></span>
        <span class="node-label">title: "StructMap-Solo"</span>
        <span class="node-type">: string</span>
      </div>

      <!-- Frontmatter item: tags -->
      <div class="tree-item">
        <span class="indent"></span><span class="indent"></span>
        <span class="twistie">▶</span>
        <span class="node-icon array"><svg viewBox="0 0 16 16"><path d="M3 2h2v12H3V2zm8 0h2v12h-2V2zm-5 3h4v2H6V5zm0 4h4v2H6V9z"/></svg></span>
        <span class="node-label">tags [3]</span>
        <span class="node-type">: array</span>
      </div>

      <!-- Heading 1: Project Overview -->
      <div class="tree-item selected">
        <span class="indent"></span>
        <span class="twistie">▼</span>
        <span class="node-icon"><svg viewBox="0 0 16 16"><path d="M1 2h14v2H1V2zm0 4h10v2H1V6zm0 4h14v2H1v-2zm0 4h8v2H1v-2z"/></svg></span>
        <span class="node-label"># Project Overview</span>
      </div>

      <!-- Heading 2: Architecture -->
      <div class="tree-item">
        <span class="indent"></span><span class="indent"></span>
        <span class="twistie">▼</span>
        <span class="node-icon"><svg viewBox="0 0 16 16"><path d="M1 2h14v2H1V2zm0 4h10v2H1V6zm0 4h14v2H1v-2zm0 4h8v2H1v-2z"/></svg></span>
        <span class="node-label">## Architecture</span>
      </div>

      <!-- Heading 3: Core Parser -->
      <div class="tree-item">
        <span class="indent"></span><span class="indent"></span><span class="indent"></span>
        <span class="twistie"></span>
        <span class="node-icon"><svg viewBox="0 0 16 16"><path d="M1 2h14v2H1V2zm0 4h10v2H1V6zm0 4h14v2H1v-2zm0 4h8v2H1v-2z"/></svg></span>
        <span class="node-label">### Core Parser</span>
      </div>

      <!-- Heading 3: Tree Provider -->
      <div class="tree-item">
        <span class="indent"></span><span class="indent"></span><span class="indent"></span>
        <span class="twistie"></span>
        <span class="node-icon"><svg viewBox="0 0 16 16"><path d="M1 2h14v2H1V2zm0 4h10v2H1V6zm0 4h14v2H1v-2zm0 4h8v2H1v-2z"/></svg></span>
        <span class="node-label">### Tree Provider</span>
      </div>

      <!-- Heading 2: Features -->
      <div class="tree-item">
        <span class="indent"></span><span class="indent"></span>
        <span class="twistie">▶</span>
        <span class="node-icon"><svg viewBox="0 0 16 16"><path d="M1 2h14v2H1V2zm0 4h10v2H1V6zm0 4h14v2H1v-2zm0 4h8v2H1v-2z"/></svg></span>
        <span class="node-label">## Features</span>
      </div>
    </div>
  </div>

  <!-- Editor Area -->
  <div class="editor-container">
    <div class="tabs-bar">
      <div class="tab">
        <svg class="tab-icon" viewBox="0 0 16 16"><path d="M13.5 3H7.7L6.2 1.5H2.5C1.7 1.5 1 2.2 1 3v10c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V4.5c0-.8-.7-1.5-1.5-1.5z"/></svg>
        <span>README.md</span>
      </div>
    </div>
    <div class="editor-body">
      <div class="line-numbers">
        1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9<br>10<br>11<br>12<br>13<br>14<br>15
      </div>
      <div class="code-content">
        <div class="code-line"><span class="kwd">---</span></div>
        <div class="code-line"><span class="key">title:</span> <span class="str">"StructMap-Solo"</span></div>
        <div class="code-line"><span class="key">tags:</span> [<span class="str">"vscode"</span>, <span class="str">"markdown"</span>, <span class="str">"json"</span>]</div>
        <div class="code-line"><span class="kwd">---</span></div>
        <div class="code-line"></div>
        <div class="code-line"><span class="md-h1"># Project Overview</span></div>
        <div class="code-line">StructMap-Solo provides instant structure visualization...</div>
        <div class="code-line"></div>
        <div class="code-line"><span class="md-h2">## Architecture</span></div>
        <div class="code-line">The system is divided into core parsers and VSCode UI providers.</div>
        <div class="code-line"></div>
        <div class="code-line"><span class="md-h3">### Core Parser</span></div>
        <div class="code-line">Pure TypeScript parsing logic with zero external dependencies.</div>
        <div class="code-line"></div>
        <div class="code-line"><span class="md-h3">### Tree Provider</span></div>
        <div class="code-line">VSCode TreeDataProvider implementation with debounced updates.</div>
      </div>
    </div>
  </div>

</body>
</html>`;

  await page.setContent(html);
  await page.screenshot({ path: path.join(__dirname, '../docs/screenshot.png') });
  await browser.close();
  console.log('Screenshot generated successfully!');
})();
