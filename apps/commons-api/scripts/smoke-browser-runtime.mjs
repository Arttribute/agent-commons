import sharp from 'sharp';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  timeout: 30_000,
});

try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>Agent Commons browser smoke</title><h1>Ready</h1>');
  if (await page.title() !== 'Agent Commons browser smoke') {
    throw new Error('Chrome did not render the expected page title');
  }
  const screenshot = await page.screenshot({ type: 'png' });
  const metadata = await sharp(screenshot).metadata();
  if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
    throw new Error('Chrome screenshot could not be decoded by Sharp');
  }
  console.log(`API browser and Sharp smoke passed (${metadata.width}x${metadata.height})`);
} finally {
  await browser.close();
}
