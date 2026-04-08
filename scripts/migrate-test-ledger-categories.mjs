import fs from 'node:fs';
import path from 'node:path';

const LEDGER_DIR = path.resolve('virtual_android_filesys/Documents_path/Moni');

const DEFAULT_CATEGORY_DESCRIPTIONS = {
  正餐: '日常正餐支出（早午晚），如快餐、正餐、工作餐',
  零食: '零食、饮品、小吃等非正餐食品',
  交通: '公共交通、打车、加油、停车等出行费用',
  娱乐: '电影、游戏、演出、会员订阅等娱乐消费',
  大餐: '聚餐、大餐、宴请、高档餐厅等特殊餐饮',
  健康: '医疗、药品、保健品、健身器材等健康支出',
  购物: '日用品、服装、电子产品、网购等购物消费',
  教育: '书籍、课程、培训、考试等教育支出',
  居住: '房租、水电煤、物业、维修等居住费用',
  旅行: '旅游、酒店、机票、景点门票等旅行支出',
  其他: '其他未分类支出',
};

const CATEGORY_KEY_MAP = {
  meal: '正餐',
  snack: '零食',
  transport: '交通',
  entertainment: '娱乐',
  feast: '大餐',
  health: '健康',
  shopping: '购物',
  education: '教育',
  housing: '居住',
  travel: '旅行',
};

function normalizeCategory(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized === 'uncategorized') {
    return normalized;
  }
  if (normalized === 'others') return '其他';
  if (normalized === '其他') return '其他';
  if (Object.hasOwn(CATEGORY_KEY_MAP, normalized)) {
    return CATEGORY_KEY_MAP[normalized];
  }
  if (Object.hasOwn(DEFAULT_CATEGORY_DESCRIPTIONS, normalized)) {
    return normalized;
  }
  return normalized;
}

function migrateDefinedCategories(definedCategories) {
  if (Array.isArray(definedCategories)) {
    const next = definedCategories.map((category) => normalizeCategory(category)).filter(Boolean);
    if (next.includes('正餐') && !next.includes('零食')) {
      const insertAt = next.indexOf('正餐') + 1;
      next.splice(insertAt, 0, '零食');
    }
    return next;
  }

  if (!definedCategories || typeof definedCategories !== 'object') {
    return definedCategories;
  }

  const next = {};
  for (const [key, description] of Object.entries(definedCategories)) {
    const nextKey = normalizeCategory(key);
    if (!nextKey) {
      continue;
    }
    next[nextKey] = typeof description === 'string'
      ? description
      : DEFAULT_CATEGORY_DESCRIPTIONS[nextKey] ?? '';
  }
  if ('正餐' in next && !('零食' in next)) {
    const ordered = {};
    for (const [key, description] of Object.entries(next)) {
      ordered[key] = description;
      if (key === '正餐') {
        ordered.零食 = DEFAULT_CATEGORY_DESCRIPTIONS.零食;
      }
    }
    return ordered;
  }
  return next;
}

function migrateLedgerFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ledger = JSON.parse(raw);
  const nextRecords = {};
  let changedRecords = 0;

  for (const [txId, record] of Object.entries(ledger.records ?? {})) {
    const nextRecord = { ...record };
    for (const field of ['category', 'ai_category', 'user_category']) {
      const before = typeof nextRecord[field] === 'string' ? nextRecord[field] : '';
      const after = normalizeCategory(before);
      if (before !== after) {
        nextRecord[field] = after;
        changedRecords += 1;
      }
    }
    nextRecords[txId] = nextRecord;
  }

  ledger.defined_categories = migrateDefinedCategories(ledger.defined_categories);
  ledger.records = nextRecords;
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

  return {
    filePath,
    changedRecords,
    totalRecords: Object.keys(nextRecords).length,
  };
}

function main() {
  if (!fs.existsSync(LEDGER_DIR)) {
    throw new Error(`Ledger directory not found: ${LEDGER_DIR}`);
  }

  const files = fs.readdirSync(LEDGER_DIR)
    .filter((name) => name.endsWith('.moni.json'))
    .map((name) => path.join(LEDGER_DIR, name));

  const results = files.map(migrateLedgerFile);
  console.log(JSON.stringify({
    migrated: results.length,
    files: results,
  }, null, 2));
}

main();
