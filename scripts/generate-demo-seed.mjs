import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 当前脚本用于把仓库里的虚拟 Android 沙盒数据打成一个随前端静态资源发布的 demo seed。
 *
 * 设计目标：
 * 1. 只读取当前 `virtual_android_filesys/sandbox_path` 的现有内容
 * 2. 输出一个稳定的 JSON 清单，供原生 App 首次启动时写回 `Directory.Data`
 * 3. 不在运行时依赖宿主文件系统路径，避免评委安装后还要手工导入
 */

const REPO_ROOT = process.cwd();
const SOURCE_ROOT = path.join(REPO_ROOT, 'virtual_android_filesys', 'sandbox_path');
const OUTPUT_FILE = path.join(REPO_ROOT, 'public', 'demo-seed-manifest.json');

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

    files.push(absolutePath);
  }

  return files;
}

/**
 * 把绝对路径转换成以 sandbox 根目录为基准的相对路径。
 *
 * 输出统一使用 `/`，确保 Android / WebView / JSON 清单消费一致。
 */
function toRelativeSeedPath(absolutePath) {
  return path.relative(SOURCE_ROOT, absolutePath).split(path.sep).join('/');
}

async function main() {
  const files = await collectFiles(SOURCE_ROOT);
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot: 'virtual_android_filesys/sandbox_path',
    files: []
  };

  for (const absolutePath of files.sort()) {
    /**
     * 当前沙盒内文件全部按 UTF-8 文本处理：
     * - `secure_config.bin` 实际存的是可直接读写的加密文本串
     * - 账本、日志、自述、记忆文件也都是文本
     */
    const content = await fs.readFile(absolutePath, 'utf8');
    manifest.files.push({
      path: toRelativeSeedPath(absolutePath),
      data: content
    });
  }

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[generate-demo-seed] wrote ${manifest.files.length} files to ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
}

await main();
