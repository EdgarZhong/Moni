import { AdapterDirectory } from '@system/adapters/IFilesystemAdapter';

/**
 * 持久化路径常量与构造函数。
 *
 * 设计目标：
 * 1. 所有正式运行时持久化统一落到 Directory.Data
 * 2. 顶层只保留全局文件
 * 3. 所有账本级文件统一收口到 ledgers/{ledger}/
 *
 * 说明：
 * - 这里不处理运行时迁移逻辑，只负责给当前版本代码提供唯一的目标路径
 * - 调用方不应再手写 examples / ai_prefs / 旧 Moni 命名空间等历史路径
 */

/**
 * 正式运行时持久化根目录统一为应用沙箱。
 */
export const PERSISTENCE_DIRECTORY = AdapterDirectory.Data;

/**
 * 顶层全局文件与顶层目录。
 */
export const LEDGERS_ROOT_DIR = 'ledgers';
export const LEDGERS_INDEX_PATH = 'ledgers.json';
export const SECURE_CONFIG_PATH = 'secure_config.bin';
export const SELF_DESCRIPTION_PATH = 'self_description.md';
export const LLM_LOG_DIR = 'logs/llm';

/**
 * 账本目录内固定文件名。
 */
export const LEDGER_FILE_NAME = 'ledger.json';
export const LEDGER_AI_PREFS_FILE_NAME = 'ai_prefs.json';
export const LEDGER_BUDGET_FILE_NAME = 'budget.json';
export const LEDGER_EXAMPLES_FILE_NAME = 'examples.json';
export const LEDGER_EXAMPLE_CHANGES_FILE_NAME = 'example_changes.json';
export const LEDGER_CLASSIFY_RUNTIME_FILE_NAME = 'classify_runtime.json';
export const LEDGER_MEMORY_DIR_NAME = 'memory';
export const LEDGER_MEMORY_INDEX_FILE_NAME = 'index.json';

/**
 * 构造账本级目录路径。
 */
export function getLedgerDirectoryPath(ledgerName: string): string {
  return `${LEDGERS_ROOT_DIR}/${ledgerName}`;
}

/**
 * 构造账本主数据路径。
 */
export function getLedgerFilePath(ledgerName: string): string {
  return `${getLedgerDirectoryPath(ledgerName)}/${LEDGER_FILE_NAME}`;
}

/**
 * 构造账本级 AI 行为配置路径。
 */
export function getLedgerAiPrefsPath(ledgerName: string): string {
  return `${getLedgerDirectoryPath(ledgerName)}/${LEDGER_AI_PREFS_FILE_NAME}`;
}

/**
 * 构造账本预算配置路径。
 */
export function getLedgerBudgetPath(ledgerName: string): string {
  return `${getLedgerDirectoryPath(ledgerName)}/${LEDGER_BUDGET_FILE_NAME}`;
}

/**
 * 构造账本实例库路径。
 */
export function getLedgerExamplesPath(ledgerName: string): string {
  return `${getLedgerDirectoryPath(ledgerName)}/${LEDGER_EXAMPLES_FILE_NAME}`;
}

/**
 * 构造账本实例库变更日志路径。
 */
export function getLedgerExampleChangesPath(ledgerName: string): string {
  return `${getLedgerDirectoryPath(ledgerName)}/${LEDGER_EXAMPLE_CHANGES_FILE_NAME}`;
}

/**
 * 构造账本分类运行态路径。
 */
export function getLedgerClassifyRuntimePath(ledgerName: string): string {
  return `${getLedgerDirectoryPath(ledgerName)}/${LEDGER_CLASSIFY_RUNTIME_FILE_NAME}`;
}

/**
 * 构造账本记忆目录与文件路径。
 */
export function getLedgerMemoryDirectoryPath(ledgerName: string): string {
  return `${getLedgerDirectoryPath(ledgerName)}/${LEDGER_MEMORY_DIR_NAME}`;
}

export function getLedgerMemoryIndexPath(ledgerName: string): string {
  return `${getLedgerMemoryDirectoryPath(ledgerName)}/${LEDGER_MEMORY_INDEX_FILE_NAME}`;
}

export function getLedgerMemorySnapshotPath(ledgerName: string, snapshotId: string): string {
  return `${getLedgerMemoryDirectoryPath(ledgerName)}/${snapshotId}.md`;
}
