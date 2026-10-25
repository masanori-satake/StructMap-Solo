const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.log('Chromium executable not found. Installing chromium...');
    execSync('npx playwright install chromium', { stdio: 'inherit' });
    browser = await chromium.launch();
  }

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
