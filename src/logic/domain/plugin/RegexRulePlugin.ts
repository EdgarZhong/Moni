import { CategoryPlugin } from './CategoryPlugin';
import type { TransactionBase } from '@shared/types/metadata';
import type { Proposal } from './types';

export class RegexRulePlugin extends CategoryPlugin {
  name = 'BuiltinRegexRules';
  version = '1.0.0';

  private rules = [
    { pattern: /麦当劳|肯德基|星巴克|饿了么|美团/i, category: '餐饮美食', reason: '知名餐饮品牌关键词' },
    { pattern: /滴滴|打车|加油|停车/i, category: '交通出行', reason: '交通相关关键词' },
    { pattern: /超市|便利店|全家|7-11/i, category: '日用百货', reason: '商超关键词' },
    { pattern: /工资|奖金|报销/i, category: '收入', reason: '收入关键词' },
  ];

  async analyze(transaction: TransactionBase): Promise<Proposal | null> {
    // 拼接关键文本字段进行匹配
    const text = `${transaction.counterparty} ${transaction.product} ${transaction.remark} ${transaction.rawClass}`.toLowerCase();

    for (const rule of this.rules) {
      if (rule.pattern.test(text)) {
        return this.createProposal(
          'RULE_ENGINE',
          rule.category,
          `Matched rule: ${rule.reason}`
        );
      }
    }

    return null;
  }
}
