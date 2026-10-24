const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const svgPath = path.resolve('assets/icon.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { margin: 0; padding: 0; background: transparent; }
          svg { width: 512px; height: 512px; display: block; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `);

  const element = await page.$('svg');
  await element.screenshot({
    path: path.resolve('assets/icon.png'),
    omitBackground: true,
  });

  await browser.close();
  console.log('Icon PNG generated successfully.');
})();
