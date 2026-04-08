
import { strict as assert } from 'assert';

console.log('--- Testing Sanitization Logic (Design 3.5) ---');

// Mock Data - 新格式：映射结构 { 标签名: 描述 }
const defined_categories: Record<string, string> = {
  meal: '日常正餐支出',
  transport: '交通出行费用',
  others: '其他支出'
};

// 从映射中提取有效标签名列表
const validCategoryNames = Object.keys(defined_categories);

// Logic extracted from useAppLogic.ts
function sanitizeCategory(candidate: string, validCategories: string[]): string {
    // Allow 'uncategorized' to pass through.
    // If category is invalid (not in defined list and not 'uncategorized'), reset to 'uncategorized'
    return (validCategories.includes(candidate) || candidate === 'uncategorized')
        ? candidate
        : 'uncategorized';
}

// Test Cases
const cases = [
    { input: 'meal', expected: 'meal', desc: 'Valid category should pass' },
    { input: 'others', expected: 'others', desc: 'Others should pass' },
    { input: 'uncategorized', expected: 'uncategorized', desc: 'uncategorized should pass' },
    { input: 'alien_tech', expected: 'uncategorized', desc: 'Invalid category should become uncategorized' },
    { input: 'MEAL', expected: 'uncategorized', desc: 'Case sensitivity check (Strict)' }, // Assuming strict match
    { input: '', expected: 'uncategorized', desc: 'Empty string should become uncategorized' },
];

let passed = 0;
let failed = 0;

cases.forEach(c => {
    const result = sanitizeCategory(c.input, validCategoryNames);
    try {
        assert.equal(result, c.expected);
        console.log(`✅ [PASS] ${c.desc}: '${c.input}' -> '${result}'`);
        passed++;
    } catch (error) {
        console.error(`❌ [FAIL] ${c.desc}: '${c.input}' -> '${result}' (Expected: '${c.expected}')`, error);
        failed++;
    }
});

console.log(`\nTest Summary: ${passed} Passed, ${failed} Failed`);

if (failed > 0) process.exit(1);
