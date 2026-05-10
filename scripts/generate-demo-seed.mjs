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
const LEGACY_ZIP_FILE = path.join(REPO_ROOT, 'public', 'seed.zip');
const LEGACY_RAW_CONFIG_FILE = path.join(REPO_ROOT, 'public', 'secure_config.bin');
const ARCHIVE_DIR = path.join(REPO_ROOT, '.archive', 'public_seed_assets');

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
 * 输出统一使用 `/`，确保 Android / WebView / JSON 清单消费一致。
 */
function toRelativeSeedPath(absolutePath) {
  return path.relative(SOURCE_ROOT, absolutePath).split(path.sep).join('/');
}

/**
 * 归档旧版静态 seed 资产，避免 Vite 把多套历史入口一起复制进 dist。
 *
 * 仓库规则要求不直接删除文件，因此统一移动到 `.archive/`。
 */
async function archiveLegacySeedAssets() {
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });

  try {
    await fs.access(LEGACY_ZIP_FILE);
    const archivedZipPath = path.join(ARCHIVE_DIR, 'seed.zip');
    await fs.rename(LEGACY_ZIP_FILE, archivedZipPath);
    console.log(`[generate-demo-seed] archived legacy seed.zip to ${path.relative(REPO_ROOT, archivedZipPath)}`);
  } catch {}

  try {
    await fs.access(LEGACY_RAW_CONFIG_FILE);
    const archivedRawConfigPath = path.join(ARCHIVE_DIR, 'secure_config.bin');
    await fs.rename(LEGACY_RAW_CONFIG_FILE, archivedRawConfigPath);
    console.log(`[generate-demo-seed] archived legacy secure_config.bin to ${path.relative(REPO_ROOT, archivedRawConfigPath)}`);
  } catch {}
}

async function main() {
  /**
   * special release 当前固定口径：
   * - 只保留 `secure_config.bin`
   * - 不携带账本、自述、记忆和任何运行态数据
   *
   * 这里沿用第一版 manifest 写盘方案，只把白名单进一步收窄为单文件。
   */
  const ALLOW_LIST = new Set([
    'secure_config.bin'
  ]);

  const allFiles = await collectFiles(SOURCE_ROOT);
  const files = allFiles.filter((absolutePath) => {
    const relativePath = toRelativeSeedPath(absolutePath);
    const fileName = path.basename(relativePath);
    return ALLOW_LIST.has(fileName);
  });

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot: 'virtual_android_filesys/sandbox_path',
    files: []
  };

  for (const absolutePath of files.sort()) {
    const content = await fs.readFile(absolutePath, 'utf8');
    manifest.files.push({
      path: toRelativeSeedPath(absolutePath),
      data: content
    });
  }

  await archiveLegacySeedAssets();
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[generate-demo-seed] wrote ${manifest.files.length} files to ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  console.log('[generate-demo-seed] special release manifest seed: secure_config.bin only');
}

await main();
