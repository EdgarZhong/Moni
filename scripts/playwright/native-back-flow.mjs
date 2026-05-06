import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const REPO_ROOT = process.cwd();
const EXTERNAL_BASE_URL = process.env.MONI_NATIVE_BACK_BASE_URL ?? 'http://localhost:5173/';
const DEV_SERVER_PORT = Number(process.env.MONI_NATIVE_BACK_PORT ?? 4173);
const DEV_SERVER_HOST = process.env.MONI_NATIVE_BACK_HOST ?? '127.0.0.1';
const FALLBACK_BASE_URL = `http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`;

/**
 * 读取项目现有 Playwright MCP 配置，保证独立脚本与 MCP 共用同一套浏览器与视口口径。
 */
async function readPlaywrightConfig() {
  const configPath = path.join(REPO_ROOT, '.codex', 'playwright.mcp.json');
  const raw = await readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * 轮询浏览器开发态是否可访问。
 * Vite 启动很快，但第一次冷启动仍然需要显式等待。
 */
async function waitForServer(url, timeoutMs = 30_000) {
  const startAt = Date.now();

  while (Date.now() - startAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // 开发服务器尚未准备好时忽略错误，继续轮询即可。
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Dev server did not become ready within ${timeoutMs}ms: ${url}`);
}

/**
 * 判断某个开发服务器是否已经可用。
 * 现成服务存在时优先复用，避免重复起 Vite 并污染用户当前工作流。
 */
async function isServerReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 独立脚本自带开发服务器生命周期，避免先手动起 Vite 再跑测试。
 */
function startDevServer() {
  const server = spawn(
    'npm',
    ['run', 'dev', '--', '--host', DEV_SERVER_HOST, '--port', String(DEV_SERVER_PORT)],
    {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    }
  );

  server.stdout.on('data', (chunk) => {
    process.stdout.write(`[vite] ${chunk}`);
  });
  server.stderr.on('data', (chunk) => {
    process.stderr.write(`[vite] ${chunk}`);
  });

  return server;
}

async function waitForDebugTools(page) {
  await page.waitForFunction(() => {
    const globalWindow = window;
    return Boolean(globalWindow.__MONI_DEBUG__ && globalWindow.__MONI_E2E__);
  });
}

async function callNativeBackReset(page) {
  return await page.evaluate(async () => {
    return await window.__MONI_DEBUG__.nativeBack.reset();
  });
}

async function callNativeBackSnapshot(page) {
  return await page.evaluate(async () => {
    return await window.__MONI_DEBUG__.nativeBack.snapshot();
  });
}

async function triggerNativeBack(page, source) {
  return await page.evaluate(async (input) => {
    return await window.__MONI_DEBUG__.nativeBack.trigger(input);
  }, {
    source,
    canGoBack: false,
  });
}

async function cleanupTempLedger(page, payload) {
  if (!payload) return;

  await page.evaluate(async ({ originalLedger, tempLedger }) => {
    try {
      if (originalLedger) {
        await window.__MONI_DEBUG__.ledger.switch(originalLedger);
      }
    } catch (error) {
      console.warn('[native-back-flow] failed to switch back original ledger', error);
    }

    try {
      if (tempLedger) {
        await window.__MONI_DEBUG__.ledger.delete(tempLedger);
      }
    } catch (error) {
      console.warn('[native-back-flow] failed to delete temp ledger', error);
    }
  }, payload);
}

async function main() {
  const playwrightConfig = await readPlaywrightConfig();
  const browserConfig = playwrightConfig.browser ?? {};
  const launchOptions = browserConfig.launchOptions ?? {};
  const contextOptions = browserConfig.contextOptions ?? {};

  let server = null;
  let activeBaseUrl = EXTERNAL_BASE_URL;
  let browser = null;
  let context = null;
  let page = null;
  let tempLedgerPayload = null;

  try {
    if (await isServerReady(EXTERNAL_BASE_URL)) {
      console.log(`[native-back-flow] 复用现有开发服务器: ${EXTERNAL_BASE_URL}`);
    } else {
      console.log(`[native-back-flow] 未检测到现有开发服务器，改为自启临时 Vite: ${FALLBACK_BASE_URL}`);
      server = startDevServer();
      activeBaseUrl = FALLBACK_BASE_URL;
      await waitForServer(activeBaseUrl);
    }

    browser = await chromium.launch({
      headless: launchOptions.headless ?? true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? launchOptions.executablePath,
    });
    context = await browser.newContext(contextOptions);
    page = await context.newPage();

    page.on('console', (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`);
    });

    await page.goto(activeBaseUrl, { waitUntil: 'networkidle' });
    await waitForDebugTools(page);

    tempLedgerPayload = await page.evaluate(async () => {
      const originalLedger = await window.__MONI_DEBUG__.ledger.getActive();
      const tempLedger = `返回测试账本_${Date.now().toString(36)}`;
      const created = await window.__MONI_DEBUG__.ledger.create(tempLedger);
      if (!created) {
        throw new Error(`Failed to create temp ledger: ${tempLedger}`);
      }

      const switched = await window.__MONI_DEBUG__.ledger.switch(tempLedger);
      if (!switched) {
        throw new Error(`Failed to switch temp ledger: ${tempLedger}`);
      }

      const subject = `返回测试交易_${Date.now().toString(36)}`;
      await window.__MONI_DEBUG__.manualEntry.add({
        amount: 88.12,
        direction: 'out',
        category: '正餐',
        subject,
        description: '用于验证 JS 返回栈的浏览器自动化路径',
      });

      return {
        originalLedger,
        tempLedger,
        subject,
      };
    });

    await page.getByText(tempLedgerPayload.subject, { exact: true }).waitFor({ state: 'visible' });

    // 1. 首页交易详情页：先关闭分类模态，再关闭详情页
    await page.getByText(tempLedgerPayload.subject, { exact: true }).click();
    await page.getByText('交易详情', { exact: true }).waitFor({ state: 'visible' });
    await page.getByTestId('transaction-detail-category-trigger').click();
    await page.getByText('选择分类', { exact: true }).waitFor({ state: 'visible' });

    await triggerNativeBack(page, 'playwright-detail-category-modal');
    await page.getByText('选择分类', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByText('交易详情', { exact: true }).waitFor({ state: 'visible' });

    await triggerNativeBack(page, 'playwright-detail-page');
    await page.getByText('交易详情', { exact: true }).waitFor({ state: 'hidden' });

    // 2. 记账页导入指南：返回键先关闭二级覆盖页
    await page.getByTestId('bottom-nav-entry').click();
    await page.getByText('导入你的账单', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('查看导入指南').click();
    await page.getByText('找到账单入口', { exact: true }).waitFor({ state: 'visible' });

    await triggerNativeBack(page, 'playwright-entry-guide');
    await page.getByText('找到账单入口', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByText('导入你的账单', { exact: true }).waitFor({ state: 'visible' });

    // 3. 设置页一级返回：第一次触发只出 toast，不应直接命中退出分支
    await page.getByTestId('bottom-nav-settings').click();
    await callNativeBackReset(page);
    await triggerNativeBack(page, 'playwright-settings-root-first');
    await page.getByTestId('native-back-exit-toast').waitFor({ state: 'visible' });

    let snapshot = await callNativeBackSnapshot(page);
    assert.equal(snapshot.exitRequestCount, 0, '首次一级返回不应立即进入退出分支');
    assert.equal(snapshot.exitToastVisible, true, '首次一级返回后必须显示退出提示');

    // 4. 回到首页，验证双击退出与超时重置
    await page.getByTestId('bottom-nav-home').click();
    await page.getByText(tempLedgerPayload.subject, { exact: true }).waitFor({ state: 'visible' });

    await callNativeBackReset(page);
    await triggerNativeBack(page, 'playwright-home-root-first');
    await page.getByTestId('native-back-exit-toast').waitFor({ state: 'visible' });

    snapshot = await callNativeBackSnapshot(page);
    assert.equal(snapshot.exitRequestCount, 0, '首页首次返回后不应立即退出');

    await triggerNativeBack(page, 'playwright-home-root-second');
    await page.getByTestId('native-back-exit-toast').waitFor({ state: 'hidden' });

    snapshot = await callNativeBackSnapshot(page);
    assert.equal(snapshot.exitRequestCount, 1, '首页 2 秒内第二次返回必须命中退出分支');

    // 5. 超过 2 秒后重新触发，必须重新回到“首次提示”而不是继续退出
    await callNativeBackReset(page);
    await triggerNativeBack(page, 'playwright-home-timeout-first');
    await page.getByTestId('native-back-exit-toast').waitFor({ state: 'visible' });
    await page.waitForTimeout(2200);
    await page.getByTestId('native-back-exit-toast').waitFor({ state: 'hidden' });

    await triggerNativeBack(page, 'playwright-home-timeout-second');
    await page.getByTestId('native-back-exit-toast').waitFor({ state: 'visible' });

    snapshot = await callNativeBackSnapshot(page);
    assert.equal(snapshot.exitRequestCount, 0, '超时后再次返回必须重新计为首次返回');
    assert.equal(snapshot.exitToastVisible, true, '超时后再次返回必须重新显示退出提示');

    console.log('[native-back-flow] 所有返回路径断言通过');
  } finally {
    if (page) {
      await cleanupTempLedger(page, tempLedgerPayload);
    }

    await context?.close();
    await browser?.close();

    server?.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('[native-back-flow] 验证失败:', error);
  process.exitCode = 1;
});
