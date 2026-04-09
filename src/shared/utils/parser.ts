import Papa from 'papaparse';
import type { Transaction } from '@shared/types';
import { TransactionStatus } from '@shared/types/metadata';
import { parse, isValid, format } from 'date-fns';

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

export const parseFiles = async (files: File[]): Promise<Transaction[]> => {
  const allTransactions: Transaction[] = [];

  for (const file of files) {
    if (!file.name.endsWith('.csv')) continue;

    try {
      const buffer = await file.arrayBuffer();
      
      // 智能编码检测策略
      // 1. 优先尝试 UTF-8
      const decoderUtf8 = new TextDecoder('utf-8', { fatal: false });
      const textUtf8 = decoderUtf8.decode(buffer);
      
      // 2. 检查 UTF-8 解码结果是否有效（包含关键标识）
      let text = textUtf8;
      let isGBK = false;
      
      const isWeChat = textUtf8.includes('微信支付账单');
      const isAlipay = textUtf8.includes('支付宝') || textUtf8.includes('电子客户回单');
      
      // 3. 如果 UTF-8 解码未发现特征，尝试 GBK
      if (!isWeChat && !isAlipay) {
        const decoderGbk = new TextDecoder('gbk', { fatal: false });
        const textGbk = decoderGbk.decode(buffer);
        
        if (textGbk.includes('微信支付账单') || textGbk.includes('支付宝') || textGbk.includes('电子客户回单')) {
          text = textGbk;
          isGBK = true;
        }
      }

      console.log(`Parsing file: ${file.name}, Detected Encoding: ${isGBK ? 'GBK' : 'UTF-8'}`);

      if (text.includes('微信支付账单')) {
        const txs = await parseWeChatCSV(text);
        allTransactions.push(...txs);
      } else if (text.includes('支付宝') || text.includes('电子客户回单')) {
        const txs = await parseAlipayCSV(text);
        allTransactions.push(...txs);
      } else {
        // 兜底策略：关键词缺失时按表头特征尝试两种解析器，避免误判为 unknown format
        const alipayFallback = await parseAlipayCSV(text);
        if (alipayFallback.length > 0) {
          allTransactions.push(...alipayFallback);
        } else {
          const wechatFallback = await parseWeChatCSV(text);
          if (wechatFallback.length > 0) {
            allTransactions.push(...wechatFallback);
          } else {
            console.warn(`Unknown CSV format for file: ${file.name}`);
          }
        }
      }

    } catch (err) {
      console.error(`Failed to parse file ${file.name}:`, err);
    }
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
