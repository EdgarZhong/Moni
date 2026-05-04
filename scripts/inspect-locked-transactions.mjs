import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * 这个脚本用于直接探测当前沙盒账本里的锁定交易数量与明细。
 *
 * 使用方式：
 * 1. 不带参数：默认读取 `ledgers.json` 里的 `activeLedger`
 *    `node scripts/inspect-locked-transactions.mjs`
 * 2. 指定账本名：
 *    `node scripts/inspect-locked-transactions.mjs 日常开销`
 *
 * 设计目标：
 * - 不经过 UI，不依赖运行中的前端状态
 * - 直接以持久化文件为准，回答“当前账本到底有几条 is_verified = true”
 * - 输出足够直观，便于和设置页的“锁定列表”做人工对照
 */

const repoRoot = process.cwd();
const sandboxRoot = path.join(repoRoot, 'virtual_android_filesys', 'sandbox_path');
const ledgersIndexPath = path.join(sandboxRoot, 'ledgers.json');

/**
 * 安全读取 JSON 文件。
 * 这里统一封装，便于后续在报错时打印清晰路径。
 */
async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * 根据命令行参数或当前激活账本，确定本次要探测哪个账本。
 */
async function resolveLedgerName() {
  const cliLedgerName = process.argv[2]?.trim();
  if (cliLedgerName) {
    return cliLedgerName;
  }

  const ledgersIndex = await readJson(ledgersIndexPath);
  if (!ledgersIndex.activeLedger) {
    throw new Error(`未在 ${ledgersIndexPath} 中找到 activeLedger`);
  }
  return ledgersIndex.activeLedger;
}

/**
 * 统一把一条交易格式化成便于人工核对的输出。
 * 字段尽量贴近设置页看到的信息：时间、来源、标题、金额、分类、锁定状态。
 */
function formatLockedRecord(record) {
  const title = record.product || record.counterparty || '(无标题)';
  const finalCategory = record.user_category || record.ai_category || record.category || 'uncategorized';
  return [
    `- id: ${record.id}`,
    `  time: ${record.time || '(无时间)'}`,
    `  sourceType: ${record.sourceType || '(无来源)'}`,
    `  title: ${title}`,
    `  amount: ${record.amount ?? '(无金额)'}`,
    `  category: ${finalCategory}`,
    `  raw category: ${record.category || '(空)'}`,
    `  user_category: ${record.user_category || '(空)'}`,
    `  ai_category: ${record.ai_category || '(空)'}`,
    `  is_verified: ${record.is_verified === true ? 'true' : 'false'}`,
  ].join('\n');
}

async function main() {
  const ledgerName = await resolveLedgerName();
  const ledgerPath = path.join(sandboxRoot, 'ledgers', ledgerName, 'ledger.json');
  const ledger = await readJson(ledgerPath);

  /**
   * 当前账本交易主数据都在 records 里。
   * 这里直接按持久化状态扫描，不做任何 UI 层派生转换。
   */
  const records = Object.values(ledger.records ?? {});
  const successRecords = records.filter((record) => record?.transactionStatus === 'SUCCESS');
  const successOutgoingRecords = successRecords.filter((record) => record?.direction === 'out');
  const successIncomingRecords = successRecords.filter((record) => record?.direction === 'in');
  const lockedRecords = records
    .filter((record) => record && record.is_verified === true)
    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));

  console.log(`账本: ${ledgerName}`);
  console.log(`文件: ${ledgerPath}`);
  console.log(`总交易数: ${records.length}`);
  console.log(`SUCCESS 交易数（设置页当前统计口径）: ${successRecords.length}`);
  console.log(`SUCCESS 支出交易数（首页“全部”主列表口径）: ${successOutgoingRecords.length}`);
  console.log(`SUCCESS 收入交易数: ${successIncomingRecords.length}`);
  console.log(`锁定交易数: ${lockedRecords.length}`);
  console.log('');

  if (lockedRecords.length === 0) {
    console.log('当前账本没有 is_verified = true 的锁定交易。');
    return;
  }

  console.log('锁定交易明细:');
  for (const record of lockedRecords) {
    console.log(formatLockedRecord(record));
    console.log('');
  }
}

main().catch((error) => {
  console.error('探测失败:');
  console.error(error);
  process.exitCode = 1;
});
