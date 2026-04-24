import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  BlobReader,
  BlobWriter,
  ZipReader,
} from '@zip.js/zip.js';
import type { Entry as ZipEntry } from '@zip.js/zip.js';
import type {
  BillImportFileSummary,
  BillImportOptions,
  BillImportPasswordState,
  BillImportProbeResult,
  BillImportSource,
  Transaction,
} from '@shared/types';
import { TransactionStatus } from '@shared/types/metadata';
import { parse, isValid, format } from 'date-fns';

/**
 * 解析器内部统一使用的探测结果。
 * 当前导入后端需要同时服务两件事：
 * 1. 纯探测：先判断文件能不能直接解析、是否需要密码
 * 2. 真导入：把文件规范化为可解析文本后，继续走交易提取
 *
 * 因此这里会保留一份“带 File 实体”的内部结构，供真正导入时继续使用。
 */
interface PreparedImportFile {
  readonly file: File;
  readonly summary: BillImportFileSummary;
}

/**
 * 解析器内部错误码。
 * 表现层不应自行猜测错误语义，而是根据后端明确返回的 code 决定下一步交互。
 */
const BILL_IMPORT_ERROR_CODE = {
  PASSWORD_REQUIRED: 'PASSWORD_REQUIRED',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  SOURCE_MISMATCH: 'SOURCE_MISMATCH',
  PARSE_FAILED: 'PARSE_FAILED',
} as const;

type BillImportErrorCode = typeof BILL_IMPORT_ERROR_CODE[keyof typeof BILL_IMPORT_ERROR_CODE];

/**
 * 账单导入专用错误。
 * - `code`：供上层精确判断分支
 * - `files`：尽量带回导致当前状态的文件摘要，便于表现层直接展示
 */
class BillImportError extends Error {
  public readonly code: BillImportErrorCode;
  public readonly files: BillImportFileSummary[];

  public constructor(code: BillImportErrorCode, message: string, files: BillImportFileSummary[] = []) {
    super(message);
    this.name = 'BillImportError';
    this.code = code;
    this.files = files;
  }
}

/**
 * 统一定义导入链路内支持的文件扩展名。
 * 当前目标是：
 * - 直接支持 zip 压缩包
 * - 兼容直接导入 csv
 * - 兼容直接导入 Excel（微信常见导出形态）
 */
const ZIP_FILE_EXTENSIONS = ['.zip'];
const CSV_FILE_EXTENSIONS = ['.csv'];
const EXCEL_FILE_EXTENSIONS = ['.xls', '.xlsx'];

/**
 * 返回小写扩展名，统一做后续判定。
 */
const getLowercaseExtension = (fileName: string): string => {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return normalized.slice(dotIndex);
};

/**
 * 仅保留压缩包内的最终文件名，避免目录层级影响后续识别与 UI 展示。
 */
const getLeafFileName = (fileName: string): string => {
  const normalized = fileName.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || fileName;
};

/**
 * 把文件扩展名替换为新的目标扩展名。
 * 若原文件没有扩展名，则直接追加。
 */
const replaceFileExtension = (fileName: string, nextExtension: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return `${fileName}${nextExtension}`;
  return `${fileName.slice(0, dotIndex)}${nextExtension}`;
};

/**
 * 统一构造文件摘要，避免各个分支手工拼对象时漏字段。
 */
const createFileSummary = (
  originalName: string,
  detectedKind: BillImportFileSummary['detectedKind'],
  overrides: Partial<BillImportFileSummary> = {},
): BillImportFileSummary => ({
  originalName,
  detectedKind,
  ...overrides,
});

const isZipFile = (file: File): boolean => ZIP_FILE_EXTENSIONS.includes(getLowercaseExtension(file.name));
const isCsvFile = (file: File): boolean => CSV_FILE_EXTENSIONS.includes(getLowercaseExtension(file.name));
const isExcelFile = (file: File): boolean => EXCEL_FILE_EXTENSIONS.includes(getLowercaseExtension(file.name));

/**
 * 生成固定形状的来源计数对象，避免表现层收到半结构化统计。
 */
const createSourceBreakdown = (): Record<BillImportSource, number> => ({
  wechat: 0,
  alipay: 0,
});

/**
 * 根据文件名推断 MIME，便于 zip 解压后的 Blob 重新包装成 File。
 */
const inferMimeType = (fileName: string): string => {
  const extension = getLowercaseExtension(fileName);
  if (extension === '.csv') return 'text/csv';
  if (extension === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (extension === '.xls') return 'application/vnd.ms-excel';
  if (extension === '.zip') return 'application/zip';
  return 'application/octet-stream';
};

/**
 * 标准化探测 / 导入选项。
 * 统一把 password 去空格，避免“输入框只填了空格”在后端被误当成真实密码。
 */
const normalizeImportOptions = (options: BillImportOptions = {}): BillImportOptions => ({
  expectedSource: options.expectedSource,
  password: options.password?.trim() ? options.password.trim() : undefined,
});

/**
 * 识别文本内容所属账单平台。
 * 这里优先看明确关键字，无法确认时返回 null 交给后续兜底解析。
 */
const detectSourceFromText = (text: string): BillImportSource | null => {
  if (text.includes('微信支付账单')) return 'wechat';
  if (text.includes('支付宝') || text.includes('电子客户回单')) return 'alipay';
  return null;
};

/**
 * 为未知后缀文件做文本解码探测。
 * 这里不要求一定命中特征词；即便暂时识别不出平台，也把 text 返回，
 * 交给后续行级解析兜底。
 */
const decodeBillTextBuffer = (buffer: ArrayBuffer): {
  text: string;
  encoding: 'UTF-8' | 'GBK';
  detectedSource: BillImportSource | null;
} => {
  const textUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const sourceUtf8 = detectSourceFromText(textUtf8);
  if (sourceUtf8) {
    return {
      text: textUtf8,
      encoding: 'UTF-8',
      detectedSource: sourceUtf8,
    };
  }

  const textGbk = new TextDecoder('gbk', { fatal: false }).decode(buffer);
  const sourceGbk = detectSourceFromText(textGbk);
  if (sourceGbk) {
    return {
      text: textGbk,
      encoding: 'GBK',
      detectedSource: sourceGbk,
    };
  }

  return {
    text: textUtf8,
    encoding: 'UTF-8',
    detectedSource: null,
  };
};

/**
 * 当用户已经从 UI 明确选择了平台时，这里负责做一致性校验。
 * 一旦文件和入口不匹配，优先给出面向用户的明确错误，而不是静默失败。
 */
const assertExpectedSource = (
  detectedSource: BillImportSource | null,
  expectedSource: BillImportSource | undefined,
  fileName: string,
): void => {
  if (!expectedSource || !detectedSource) return;
  if (expectedSource === detectedSource) return;
  const expectedLabel = expectedSource === 'wechat' ? '微信' : '支付宝';
  const actualLabel = detectedSource === 'wechat' ? '微信' : '支付宝';
  throw new BillImportError(
    BILL_IMPORT_ERROR_CODE.SOURCE_MISMATCH,
    `当前选择的是${expectedLabel}导入，但文件“${fileName}”识别为${actualLabel}账单`,
    [createFileSummary(fileName, 'unknown')],
  );
};

/**
 * 从压缩包里读取目录信息。
 * 该步骤只做“能否识别为 zip / 是否加密 / 内部文件名有哪些”的探测，
 * 不会在未提供密码时强行报错成“导入失败”。
 */
const inspectArchiveEntries = async (file: File): Promise<{
  entries: ZipEntry[];
  encryptedEntries: string[];
}> => {
  const zipReader = new ZipReader(new BlobReader(file));
  try {
    const entries = await zipReader.getEntries();
    return {
      entries,
      encryptedEntries: entries
        .filter((entry) => !entry.directory && entry.encrypted)
        .map((entry) => getLeafFileName(entry.filename)),
    };
  } finally {
    await zipReader.close();
  }
};

/**
 * 真正执行压缩包解压。
 * 该函数只在以下两种场景被调用：
 * 1. 探测阶段已确认需要密码，且上层补回了密码
 * 2. 压缩包本身未加密
 */
const extractArchiveFiles = async (
  file: File,
  password: string | undefined,
): Promise<File[]> => {
  const zipReader = new ZipReader(new BlobReader(file));
  try {
    const entries = await zipReader.getEntries();
    const encryptedEntries = entries
      .filter((entry) => !entry.directory && entry.encrypted)
      .map((entry) => getLeafFileName(entry.filename));
    const archiveSummary = createFileSummary(file.name, 'archive', {
      requiresPassword: encryptedEntries.length > 0,
      extractedEntries: entries.filter((entry) => !entry.directory).map((entry) => getLeafFileName(entry.filename)),
    });

    if (encryptedEntries.length > 0 && !password) {
      throw new BillImportError(
        BILL_IMPORT_ERROR_CODE.PASSWORD_REQUIRED,
        '所选压缩包需要输入解压密码',
        [archiveSummary],
      );
    }

    const extractedFiles: File[] = [];
    for (const entry of entries) {
      if (entry.directory) continue;

      try {
        const blob = await entry.getData(
          new BlobWriter(inferMimeType(entry.filename)),
          password ? { password } : undefined,
        );
        const entryName = getLeafFileName(entry.filename);
        extractedFiles.push(
          new File([blob], entryName, {
            type: blob.type || inferMimeType(entryName),
            lastModified: entry.lastModDate?.getTime() ?? Date.now(),
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Invalid password')) {
          throw new BillImportError(
            BILL_IMPORT_ERROR_CODE.INVALID_PASSWORD,
            '解压密码错误，请重新输入',
            [archiveSummary],
          );
        }
        throw new BillImportError(
          BILL_IMPORT_ERROR_CODE.PARSE_FAILED,
          `解压压缩包失败：${getLeafFileName(entry.filename)}`,
          [archiveSummary],
        );
      }
    }

    return extractedFiles;
  } finally {
    await zipReader.close();
  }
};

/**
 * Excel 账单先统一转成 CSV 文本，再复用现有 CSV 解析逻辑。
 * 这样后续所有平台字段映射仍只维护一套实现，避免同一平台维护两份解析器。
 */
const convertExcelFileToCsv = async (
  file: File,
  normalizedName: string = replaceFileExtension(file.name, '.csv'),
): Promise<File> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new BillImportError(
      BILL_IMPORT_ERROR_CODE.PARSE_FAILED,
      `Excel 文件“${file.name}”未找到可读取的工作表`,
      [createFileSummary(file.name, 'excel')],
    );
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const csvText = XLSX.utils.sheet_to_csv(firstSheet, {
    blankrows: false,
  });

  return new File([csvText], normalizedName, {
    type: 'text/csv',
    lastModified: file.lastModified,
  });
};

/**
 * 解析文本内容为交易列表。
 * 这一步既服务于真正导入，也服务于“先探测文件能不能直接解析”的判断。
 */
const parseTransactionsFromText = async (
  text: string,
  fileName: string,
  options: BillImportOptions,
): Promise<Transaction[]> => {
  const detectedSource = detectSourceFromText(text);
  assertExpectedSource(detectedSource, options.expectedSource, fileName);

  if (detectedSource === 'wechat') {
    return await parseWeChatCSV(text);
  }

  if (detectedSource === 'alipay') {
    return await parseAlipayCSV(text);
  }

  /**
   * 关键词不足时，继续按平台规则兜底。
   * 若调用方已经明确给了 expectedSource，则优先尝试该平台，降低误判概率。
   */
  const fallbackOrder: BillImportSource[] = options.expectedSource
    ? [options.expectedSource, options.expectedSource === 'wechat' ? 'alipay' : 'wechat']
    : ['alipay', 'wechat'];

  for (const source of fallbackOrder) {
    const transactions = source === 'wechat'
      ? await parseWeChatCSV(text)
      : await parseAlipayCSV(text);
    if (transactions.length > 0) {
      return transactions;
    }
  }

  return [];
};

/**
 * 为“未知后缀但可能是文本账单”的文件做探测。
 * 若文本本身可直接解析，则直接把它规范化为 CSV 候选文件。
 */
const tryPrepareTextLikeFile = async (
  file: File,
  options: BillImportOptions,
): Promise<PreparedImportFile | null> => {
  const buffer = await file.arrayBuffer();
  const decoded = decodeBillTextBuffer(buffer);
  const transactions = await parseTransactionsFromText(decoded.text, file.name, options);
  if (transactions.length === 0) {
    return null;
  }

  const normalizedName = isCsvFile(file) ? file.name : replaceFileExtension(file.name, '.csv');
  return {
    file: new File([decoded.text], normalizedName, {
      type: 'text/csv',
      lastModified: file.lastModified,
    }),
    summary: createFileSummary(file.name, 'csv', {
      normalizedName,
    }),
  };
};

/**
 * 为“未知后缀但可能是 Excel 账单”的文件做探测。
 * 这里先尝试读取工作簿，再验证转换后的 CSV 是否真能提取出交易。
 */
const tryPrepareExcelLikeFile = async (
  file: File,
  options: BillImportOptions,
): Promise<PreparedImportFile | null> => {
  try {
    const normalizedName = replaceFileExtension(file.name, '.csv');
    const csvFile = await convertExcelFileToCsv(file, normalizedName);
    const csvText = await csvFile.text();
    const transactions = await parseTransactionsFromText(csvText, csvFile.name, options);
    if (transactions.length === 0) {
      return null;
    }
    return {
      file: csvFile,
      summary: createFileSummary(file.name, 'excel', {
        normalizedName,
      }),
    };
  } catch (error) {
    if (error instanceof BillImportError && error.code === BILL_IMPORT_ERROR_CODE.SOURCE_MISMATCH) {
      throw error;
    }
    return null;
  }
};

/**
 * 为压缩包准备可解析文件。
 * `strictArchive` 为 true 时，只要文件名明确是 zip，就把它视为压缩包并给出明确错误；
 * 为 false 时，压缩包探测失败会继续让调用方尝试其它路径。
 */
const prepareArchiveFile = async (
  file: File,
  options: BillImportOptions,
  strictArchive: boolean,
): Promise<PreparedImportFile[] | null> => {
  try {
    const inspection = await inspectArchiveEntries(file);
    const extractedFiles = await extractArchiveFiles(file, options.password);
    const nestedPrepared = await prepareImportFiles(extractedFiles, options);
    return nestedPrepared.map((prepared) => ({
      ...prepared,
      summary: {
        ...prepared.summary,
        extractedEntries: inspection.entries
          .filter((entry: ZipEntry) => !entry.directory)
          .map((entry: ZipEntry) => getLeafFileName(entry.filename)),
      },
    }));
  } catch (error) {
    if (error instanceof BillImportError) {
      throw error;
    }
    if (strictArchive) {
      throw new BillImportError(
        BILL_IMPORT_ERROR_CODE.UNSUPPORTED_FILE,
        `暂不支持解析文件“${file.name}”`,
        [createFileSummary(file.name, 'archive')],
      );
    }
    return null;
  }
};

/**
 * 把单个原始文件递归规范化为“可继续提取交易”的文件集合。
 * 处理顺序遵循用户要求：
 * 1. 先看是否能直接解析
 * 2. 不能直接解析，再判断是否是压缩包，以及是否需要密码
 */
const prepareSingleFile = async (
  file: File,
  options: BillImportOptions,
): Promise<PreparedImportFile[]> => {
  if (isCsvFile(file)) {
    return [{
      file,
      summary: createFileSummary(file.name, 'csv', {
        normalizedName: file.name,
      }),
    }];
  }

  if (isExcelFile(file)) {
    const normalizedName = replaceFileExtension(file.name, '.csv');
    return [{
      file: await convertExcelFileToCsv(file, normalizedName),
      summary: createFileSummary(file.name, 'excel', {
        normalizedName,
      }),
    }];
  }

  if (isZipFile(file)) {
    const archivePrepared = await prepareArchiveFile(file, options, true);
    return archivePrepared ?? [];
  }

  const directTextPrepared = await tryPrepareTextLikeFile(file, options);
  if (directTextPrepared) {
    return [directTextPrepared];
  }

  const directExcelPrepared = await tryPrepareExcelLikeFile(file, options);
  if (directExcelPrepared) {
    return [directExcelPrepared];
  }

  const archivePrepared = await prepareArchiveFile(file, options, false);
  if (archivePrepared) {
    return archivePrepared;
  }

  throw new BillImportError(
    BILL_IMPORT_ERROR_CODE.UNSUPPORTED_FILE,
    `暂不支持解析文件“${file.name}”`,
    [createFileSummary(file.name, 'unknown')],
  );
};

/**
 * 批量准备导入文件。
 * 返回的结果仍是“规范化后的文件”，真正交易提取会在后续统一执行。
 */
const prepareImportFiles = async (
  files: File[],
  options: BillImportOptions,
): Promise<PreparedImportFile[]> => {
  const preparedFiles: PreparedImportFile[] = [];

  for (const file of files) {
    preparedFiles.push(...await prepareSingleFile(file, options));
  }

  if (preparedFiles.length === 0) {
    throw new BillImportError(
      BILL_IMPORT_ERROR_CODE.UNSUPPORTED_FILE,
      '未识别到可导入的账单文件',
    );
  }

  return preparedFiles;
};

// 生成唯一ID (SHA-256)
const generateId = async (str: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // 取前 16 位 hex 足够了
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

// 清洗金额
const cleanAmount = (amountStr: string): number => {
  if (!amountStr) return 0;
  // 去除 ¥, ?, 逗号, 空格
  const cleanStr = amountStr.replace(/[¥?？, ]/g, '');
  return parseFloat(cleanStr) || 0;
};

// 状态映射助手函数
const mapWeChatStatus = (statusStr: string = ''): TransactionStatus => {
  const s = statusStr.trim();
  if (s.includes('支付成功') || s.includes('已收钱') || s.includes('已存入')) return TransactionStatus.SUCCESS;
  if (s.includes('退款')) return TransactionStatus.REFUND;
  if (s.includes('已关闭') || s.includes('已撤销') || s.includes('对方已退还')) return TransactionStatus.CLOSED;
  if (s.includes('待') || s.includes('处理中')) return TransactionStatus.PROCESSING;
  return TransactionStatus.OTHER; // e.g. 转入零钱, 提现已到账
};

const mapAlipayStatus = (statusStr: string = ''): TransactionStatus => {
  const s = statusStr.trim();
  if (s.includes('成功')) return TransactionStatus.SUCCESS; // 交易成功, 支付成功
  if (s.includes('关闭')) return TransactionStatus.CLOSED; // 交易关闭
  if (s.includes('退款')) return TransactionStatus.REFUND;
  if (s.includes('进行中') || s.includes('等待')) return TransactionStatus.PROCESSING;
  return TransactionStatus.OTHER;
};

const parseDirection = (directionStr: string): 'in' | 'out' | null => {
  const d = directionStr.trim();
  if (!d) return null;
  if (d === '收入' || d === 'in' || d.includes('收款') || d.includes('已收钱')) return 'in';
  if (d === '支出' || d === 'out' || d.includes('付款')) return 'out';
  return null;
};

// 解析微信 CSV
const parseWeChatCSV = async (csvText: string): Promise<Transaction[]> => {
  // 微信CSV前16行是头部信息，第17行是表头
  // 找到表头行 "交易时间,交易类型..."
  const lines = csvText.split('\n');
  const headerIndex = lines.findIndex(line => line.includes('交易时间') && line.includes('交易类型'));
  
  if (headerIndex === -1) return [];

  const csvContent = lines.slice(headerIndex).join('\n');
  
  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(), // 去除表头空格
  });

  const transactions: Transaction[] = [];
  let skippedNoTradeNo = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of results.data as any[]) {
    // 微信字段: 交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
    const dateStr = row['交易时间']?.trim();
    if (!dateStr) continue;

    const date = parse(dateStr, 'yyyy-MM-dd HH:mm:ss', new Date());
    if (!isValid(date)) continue;

    const directionStr = row['收/支']?.trim();
    const amountStr = row['金额(元)']?.trim();
    
    // 过滤掉非收支记录（如中性交易）或者金额为0的
    if (directionStr !== '收入' && directionStr !== '支出') continue;

    const amount = cleanAmount(amountStr);
    const counterparty = row['交易对方']?.trim() || 'Unknown';
    const product = row['商品']?.trim() || 'Unknown';
    const category = row['交易类型']?.trim() || 'Unknown';
    const tradeNo = row['交易单号']?.trim(); // 微信官方唯一单号
    const paymentMethod = row['支付方式']?.trim() || 'Unknown';
    const statusStr = row['当前状态']?.trim() || '';
    const remark = row['备注']?.trim() || '';

    // 构造去重指纹
    // 策略：必须存在官方交易单号，否则丢弃。
    if (!tradeNo) {
      skippedNoTradeNo += 1;
      continue;
    }
    const uniqueFingerprint = `wx:${tradeNo}`;

    const id = await generateId(uniqueFingerprint);

    transactions.push({
      id: id,
      originalId: tradeNo,
      originalDate: date,
      time: format(date, 'yyyy-MM-dd HH:mm:ss'), // 生成标准时间字符串
      sourceType: 'wechat',
      category: 'uncategorized', // 默认分类，等待 AI/人工处理
      rawClass: category, // 原始分类
      counterparty: counterparty,
      product: product,
      amount: amount,
      direction: directionStr === '收入' ? 'in' : 'out',
      paymentMethod: paymentMethod,
      transactionStatus: mapWeChatStatus(statusStr),
      remark: remark,
    });
  }

  if (skippedNoTradeNo > 0) {
    console.warn(`[parser] WeChat rows skipped due to missing 交易单号: ${skippedNoTradeNo}`);
  }
  return transactions;
};

// 解析支付宝 CSV
const parseAlipayCSV = async (csvText: string): Promise<Transaction[]> => {
  // 支付宝CSV前24行左右是头部，包含 "电子客户回单"
  // 表头: 交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额...
  const lines = csvText.split('\n');
  const headerIndex = lines.findIndex(line => line.includes('交易时间') && line.includes('交易分类'));
  
  const parseAlipayRowsByColumns = async (rows: string[][]): Promise<Transaction[]> => {
    const transactions: Transaction[] = [];
    let skippedNoTradeNo = 0;

    for (const row of rows) {
      if (!row || row.length < 10) continue;

      const dateStr = (row[0] || '').trim();
      if (!dateStr) continue;

      const date = parse(dateStr, 'yyyy-MM-dd HH:mm:ss', new Date());
      if (!isValid(date)) continue;

      const direction = parseDirection((row[5] || '').trim());
      if (!direction) continue;

      const amount = cleanAmount((row[6] || '').trim());
      const counterparty = (row[2] || '').trim() || 'Unknown';
      const product = (row[4] || '').trim() || 'Unknown';
      const category = (row[1] || '').trim() || 'Unknown';
      const tradeNo = ((row[9] || row[10] || '') as string).trim();
      const paymentMethod = (row[7] || '').trim() || 'Unknown';
      const statusStr = (row[8] || '').trim();
      const remark = (row[11] || '').trim();

      if (!tradeNo) {
        skippedNoTradeNo += 1;
        continue;
      }

      const uniqueFingerprint = `ali:${tradeNo}`;
      const id = await generateId(uniqueFingerprint);
      transactions.push({
        id,
        originalId: tradeNo,
        originalDate: date,
        time: format(date, 'yyyy-MM-dd HH:mm:ss'),
        sourceType: 'alipay',
        category: 'uncategorized',
        rawClass: category,
        counterparty,
        product,
        amount,
        direction,
        paymentMethod,
        transactionStatus: mapAlipayStatus(statusStr),
        remark,
      });
    }

    if (skippedNoTradeNo > 0) {
      console.warn(`[parser] Alipay rows skipped due to missing trade number: ${skippedNoTradeNo}`);
    }
    return transactions;
  };

  if (headerIndex === -1) {
    // 兜底：兼容乱码表头（如 GBK 被错误解码），按列位解析
    const firstDataIndex = lines.findIndex((line) =>
      /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},/.test(line.trim())
    );
    if (firstDataIndex === -1) return [];
    const fallbackRows = Papa.parse<string[]>(lines.slice(firstDataIndex).join('\n'), {
      header: false,
      skipEmptyLines: true,
    }).data;
    return parseAlipayRowsByColumns(fallbackRows);
  }

  // 支付宝CSV末尾可能有注释，通常以 --------- 结束或者空行
  // 这里直接取从header开始的内容
  const csvContent = lines.slice(headerIndex).join('\n');

  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(), // 去除表头空格
  });

  const transactions: Transaction[] = [];
  let skippedNoTradeNo = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of results.data as any[]) {
    // 支付宝字段: 交易时间, 交易分类, 交易对方, 对方账号, 商品说明, 收/支, 金额, ...
    // 注意: 支付宝CSV字段值可能包含空格，papaparse 默认 trimHeaders: false, trimValues: false
    // 且表头可能包含空格
    
    const dateStr = (row['交易时间'] || '').trim();
    if (!dateStr) continue;

    const date = parse(dateStr, 'yyyy-MM-dd HH:mm:ss', new Date());
    if (!isValid(date)) continue;

    const direction = parseDirection((row['收/支'] || '').trim()); // 支付宝可能是 "支出" 或 "收入" 或空（不计收支）
    const amountStr = (row['金额'] || '').trim();

    if (!direction) continue;

    const amount = cleanAmount(amountStr);
    const counterparty = (row['交易对方'] || '').trim() || 'Unknown';
    const product = (row['商品说明'] || '').trim() || 'Unknown';
    const category = (row['交易分类'] || '').trim() || 'Unknown';
    // 兼容不同的支付宝导出格式字段名
    const tradeNo = (row['交易号'] || row['交易订单号'] || row['商家订单号'] || '').trim(); 
    const paymentMethod = (row['收/付款方式'] || row['支付方式'] || '').trim() || 'Unknown'; // 支付宝列名可能是这个，需注意
    const statusStr = (row['交易状态'] || '').trim();
    const remark = (row['备注'] || '').trim();

    // 构造去重指纹
    if (!tradeNo) {
      skippedNoTradeNo += 1;
      continue;
    }
    const uniqueFingerprint = `ali:${tradeNo}`;

    const id = await generateId(uniqueFingerprint);

    transactions.push({
      id: id,
      originalId: tradeNo,
      originalDate: date,
      time: format(date, 'yyyy-MM-dd HH:mm:ss'),
      sourceType: 'alipay',
      category: 'uncategorized', // Default to uncategorized for new imports
          rawClass: category,
      counterparty: counterparty,
      product: product,
      amount: amount,
      direction,
      paymentMethod: paymentMethod,
      transactionStatus: mapAlipayStatus(statusStr),
      remark: remark,
    });
  }

  if (skippedNoTradeNo > 0) {
    console.warn(`[parser] Alipay rows skipped due to missing trade number: ${skippedNoTradeNo}`);
  }
  return transactions;
};

/**
 * 对规范化后的文件统一执行交易提取。
 * 这里不再关心原始文件是不是 zip / excel，而只处理最终可消费的文本文件。
 */
const parsePreparedFiles = async (
  preparedFiles: PreparedImportFile[],
  options: BillImportOptions,
): Promise<Transaction[]> => {
  const allTransactions: Transaction[] = [];

  for (const prepared of preparedFiles) {
    const buffer = await prepared.file.arrayBuffer();
    const decoded = decodeBillTextBuffer(buffer);
    console.log(`Parsing file: ${prepared.file.name}, Detected Encoding: ${decoded.encoding}`);

    const transactions = await parseTransactionsFromText(decoded.text, prepared.file.name, options);
    if (transactions.length === 0) {
      const expectedLabel = options.expectedSource === 'wechat'
        ? '微信'
        : options.expectedSource === 'alipay'
          ? '支付宝'
          : '账单';
      throw new BillImportError(
        BILL_IMPORT_ERROR_CODE.PARSE_FAILED,
        `未识别到有效的${expectedLabel}记录，请检查文件内容`,
        [prepared.summary],
      );
    }
    allTransactions.push(...transactions);
  }

  // 内存去重：基于 ID (SHA-256) 过滤重复交易
  const uniqueMap = new Map<string, Transaction>();
  for (const tx of allTransactions) {
    if (!uniqueMap.has(tx.id)) {
      uniqueMap.set(tx.id, tx);
    }
  }
  
  const uniqueTransactions = Array.from(uniqueMap.values());

  // 按时间倒序排序 (使用 originalDate)
  return uniqueTransactions.sort((a, b) => b.originalDate.getTime() - a.originalDate.getTime());
};

/**
 * 先探测文件，再让表现层决定是否要弹密码输入框。
 * 这个接口不会写账本，只负责回答：
 * - 当前文件能否直接导入
 * - 是否需要密码
 * - 后端已经识别出多少条交易
 */
export const probeImportFiles = async (
  files: File[],
  options: BillImportOptions = {},
): Promise<BillImportProbeResult> => {
  const normalizedOptions = normalizeImportOptions(options);
  try {
    const preparedFiles = await prepareImportFiles(files, normalizedOptions);
    const transactions = await parsePreparedFiles(preparedFiles, normalizedOptions);
    const sourceBreakdown = createSourceBreakdown();
    for (const transaction of transactions) {
      if (transaction.sourceType === 'wechat' || transaction.sourceType === 'alipay') {
        sourceBreakdown[transaction.sourceType] += 1;
      }
    }

    return {
      status: 'ready',
      message: '已识别到可直接导入的账单文件',
      files: preparedFiles.map((prepared) => prepared.summary),
      expectedSource: normalizedOptions.expectedSource,
      transactionCount: transactions.length,
      sourceBreakdown,
    };
  } catch (error) {
    if (error instanceof BillImportError) {
      const passwordState: BillImportPasswordState | undefined = error.code === BILL_IMPORT_ERROR_CODE.PASSWORD_REQUIRED
        ? 'missing'
        : error.code === BILL_IMPORT_ERROR_CODE.INVALID_PASSWORD
          ? 'invalid'
          : undefined;

      if (passwordState) {
        return {
          status: 'password_required',
          message: error.message,
          files: error.files,
          expectedSource: normalizedOptions.expectedSource,
          passwordState,
        };
      }

      return {
        status: 'unsupported',
        message: error.message,
        files: error.files,
        expectedSource: normalizedOptions.expectedSource,
      };
    }

    throw error;
  }
};

/**
 * 真正执行文件解析。
 * 当前仍保留原函数名，是为了不打断旧入口；内部实现已经升级为
 * “先探测 / 规范化，再统一解析”的新链路。
 */
export const parseFiles = async (
  files: File[],
  options: BillImportOptions = {},
): Promise<Transaction[]> => {
  const normalizedOptions = normalizeImportOptions(options);
  const preparedFiles = await prepareImportFiles(files, normalizedOptions);
  return await parsePreparedFiles(preparedFiles, normalizedOptions);
};
