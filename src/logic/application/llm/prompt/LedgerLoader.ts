import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { getLedgerStorageDirectory, DEFAULT_LEDGER_NAME, DEFAULT_MEMORY } from '@system/filesystem/fs-storage';
import { getLedgerFilePath } from '@system/filesystem/persistence-paths';
import type { LedgerMemory } from '@shared/types/metadata';
import { LedgerService } from '../../services/LedgerService';

export class LedgerLoader {
  public static async loadCategories(ledgerName: string = DEFAULT_LEDGER_NAME): Promise<Record<string, string>> {
    try {
      const fs = FilesystemService.getInstance();
      const directory = getLedgerStorageDirectory();
      const memory = JSON.parse(await fs.readFile({
        path: getLedgerFilePath(ledgerName),
        directory,
        encoding: AdapterEncoding.UTF8
      })) as LedgerMemory;
      return LedgerService.normalizeCategoryDefinitions(
        memory.defined_categories || DEFAULT_MEMORY.defined_categories
      );
    } catch (e) {
      console.warn(`[LedgerLoader] Failed to load ledger(${ledgerName}) from ${getLedgerStorageDirectory()}, using default categories.`, e);
      return LedgerService.normalizeCategoryDefinitions(DEFAULT_MEMORY.defined_categories);
    }
  }
}
