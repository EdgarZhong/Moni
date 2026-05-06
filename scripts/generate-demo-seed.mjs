import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

/**
 * 当前脚本用于把仓库里的虚拟 Android 沙盒数据打包成 `public/seed.zip`，
 * 随前端静态资源一起发布到 APK assets 中。
 *
 * 设计目标：
 * 1. 只读取当前 `virtual_android_filesys/sandbox_path` 的现有内容
 * 2. 输出一个 zip 压缩包，供原生 App 首次启动时一次性解压到 `Directory.Data`
 * 3. 不在运行时依赖宿主文件系统路径，避免评委安装后还要手工导入
 *
 * 相比上一版 `demo-seed-manifest.json`（逐个文件 writeFile），zip 方案：
 * - 一次性解压，不存在"只写了一半就中断"的部分落盘风险
 * - 减少 19 次异步 I/O 为 1 次 fetch + 1 次批量解压
 */

const REPO_ROOT = process.cwd();
const SOURCE_ROOT = path.join(REPO_ROOT, 'virtual_android_filesys', 'sandbox_path');
const OUTPUT_FILE = path.join(REPO_ROOT, 'public', 'seed.zip');

/**
 * 递归收集目录内所有文件。
 *
 * 注意：
 * - 只收集普通文件，不收集目录本身
 * - `.gitkeep` 这类仅为仓库占位的文件不进入 seed
 */
async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === '.gitkeep') {
      continue;
    }

    // LLM 调试日志不打入 demo seed
    if (absolutePath.includes(`${path.sep}llm_logs${path.sep}`) || absolutePath.includes('/llm_logs/')) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

/**
 * 把绝对路径转换成以 sandbox 根目录为基准的相对路径。
 *
 * 输出统一使用 `/`，确保 Android / WebView / zip 条目消费一致。
 */
function toRelativeSeedPath(absolutePath) {
  return path.relative(SOURCE_ROOT, absolutePath).split(path.sep).join('/');
}

async function main() {
  /**
   * v0.3.7 zip 方案过滤策略：
   * - 携带所有用户数据（账本、记忆、实例库、分类运行态、全局配置、自述等）
   * - 仅排除 .gitkeep 仓库占位文件与 llm_logs 调试日志
   */
  const allFiles = await collectFiles(SOURCE_ROOT);

  const zip = new JSZip();

  for (const absolutePath of allFiles.sort()) {
    const relativePath = toRelativeSeedPath(absolutePath);
    const content = await fs.readFile(absolutePath);
    // 把文件按相对路径加入 zip，目录结构由 zip 自动维护
    zip.file(relativePath, content);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, buffer);

  const fileCount = allFiles.length;
  const sizeKB = (buffer.length / 1024).toFixed(1);
  console.log(`[generate-demo-seed] wrote ${fileCount} files (${sizeKB} KB) to ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  console.log(`[generate-demo-seed] v0.3.7 seed.zip: all user data (ledgers, memory, examples, config, etc.)`);
}

await main();
