#!/usr/bin/env node
// Desenha o Lean Canvas (canvas/canvas.html) em canvas/canvas.png (o PDF do arc42 o leva em anexo) e em
// canvas/canvas.pdf (uma página A4 deitada, para entregar à parte). Usa o Chrome instalado.
//
//   npm run canvas
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from './prints.mjs';

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(docs, 'canvas');
const source = pathToFileURL(path.join(dir, 'canvas.html')).href;

const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  // A4 deitado a 96 dpi (1123 × 794), com o dobro de pixels para o texto ficar nítido no PDF do arc42.
  await page.setViewport({ width: 1123, height: 794, deviceScaleFactor: 2 });
  await page.goto(source, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('section')]
      .filter((section) => section.scrollHeight > section.clientHeight + 1)
      .map((section) => section.querySelector('h2')?.firstChild?.textContent?.trim()),
  );
  if (overflow.length > 0) throw new Error(`Texto demais para o espaço em: ${overflow.join(', ')}`);
  await page.screenshot({ path: path.join(dir, 'canvas.png') });
  await page.pdf({
    path: path.join(dir, 'canvas.pdf'),
    landscape: true,
    format: 'A4',
    printBackground: true,
  });
} finally {
  await browser.close();
}
for (const file of ['canvas.png', 'canvas.pdf']) {
  const target = path.join(dir, file);
  if (!existsSync(target) || statSync(target).size < 10_000) throw new Error(`Não gerou ${file}.`);
  process.stdout.write(
    `${path.relative(process.cwd(), target)} (${Math.round(statSync(target).size / 1024)} KB)\n`,
  );
}
