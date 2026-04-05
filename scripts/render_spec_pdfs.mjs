import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';
import puppeteer from 'puppeteer-core';

const repoRoot = '/workspace';
const specsDir = path.join(repoRoot, 'docs', 'specs');
const outDir = specsDir;
const chromePath = '/usr/local/bin/google-chrome';

const targets = [
  {
    md: path.join(specsDir, 'processmap_full_project_spec.md'),
    html: path.join(outDir, 'processmap_full_project_spec.html'),
    pdf: path.join(outDir, 'processmap_full_project_spec.pdf'),
    title: 'ProcessMap Full Project Specification',
  },
  {
    md: path.join(specsDir, 'processmap_import_analysis_spec.md'),
    html: path.join(outDir, 'processmap_import_analysis_spec.html'),
    pdf: path.join(outDir, 'processmap_import_analysis_spec.pdf'),
    title: 'ProcessMap Import and Text Analysis Specification',
  },
];

function wrapHtml(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      line-height: 1.45;
      color: #0f172a;
      max-width: 920px;
      margin: 32px auto;
      padding: 0 24px 40px;
      font-size: 12px;
    }
    h1, h2, h3, h4 {
      line-height: 1.2;
      margin-top: 1.4em;
      margin-bottom: 0.55em;
      color: #111827;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.25em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.2em; }
    h3 { font-size: 1.22em; }
    h4 { font-size: 1.08em; }
    p { margin: 0.55em 0; }
    ul, ol { margin: 0.35em 0 0.65em 1.35em; }
    li { margin: 0.2em 0; }
    code {
      background: #f3f4f6;
      padding: 0.1em 0.3em;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 0.92em;
    }
    pre {
      background: #0b1020;
      color: #e5e7eb;
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      font-size: 0.9em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.8em 0 1em;
      font-size: 0.95em;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6px 8px;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
    }
    blockquote {
      border-left: 3px solid #cbd5e1;
      margin: 0.7em 0;
      padding: 0.2em 0.8em;
      color: #334155;
      background: #f8fafc;
    }
    .page-break { page-break-before: always; break-before: page; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function renderTarget(browser, target) {
  const markdown = await fs.readFile(target.md, 'utf8');
  const htmlBody = marked.parse(markdown);
  const htmlDoc = wrapHtml(target.title, htmlBody);
  await fs.writeFile(target.html, htmlDoc, 'utf8');

  const page = await browser.newPage();
  await page.goto(pathToFileURL(target.html).href, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: target.pdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
  });
  await page.close();
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    for (const target of targets) {
      await renderTarget(browser, target);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
