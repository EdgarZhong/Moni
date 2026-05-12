import { DEFAULT_SELF_DESCRIPTION_DEMO } from '@shared/constants/selfDescription';
import type { HomeHintCardReadModel } from '@shared/types';
import type { BudgetHintCard } from '@shared/types/budget';
import type { LedgerHomeHintState } from './HomeHintStateManager';

/**
 * 首页提示系统构建所需的原始事实。
 * AppFacade 负责组装真实数据，这里只负责按规则生成提示卡。
 */
export interface HomeHintFacts {
  selfDescription: string;
  hasMonthlyBudget: boolean;
  hasImportedTransactions: boolean;
  /** 最近一次成功导入账单的 ISO 时间戳；null 表示从未导入 */
  lastBillImportAt: string | null;
  onboardingState: LedgerHomeHintState;
  budgetHints: BudgetHintCard[];
}

/**
 * HomeHintSystemBuilder - 首页情景提示系统构建器
 *
 * 规则固定为：
 * 1. onboarding 主线优先
 * 2. onboarding 仍有未完成步骤时，只返回第一张未完成卡片
 * 3. onboarding 全部完成后，再让现有预算提示进入候选
 */
export class HomeHintSystemBuilder {
  public static build(facts: HomeHintFacts): HomeHintCardReadModel[] {
    const onboardingPrimary = this.buildOnboardingPrimaryCard(facts);
    if (onboardingPrimary) {
      return [onboardingPrimary];
    }

    // onboarding 全部完成后，先检查是否需要显示账单导入提醒
    const importReminder = this.buildImportReminderCard(facts);
    if (importReminder) {
      return [importReminder];
    }

    return facts.budgetHints.map((hint) => this.mapBudgetHint(hint));
  }

  /**
   * 构造 onboarding 链路里当前应该显示的第一张卡片。
   */
  private static buildOnboardingPrimaryCard(facts: HomeHintFacts): HomeHintCardReadModel | null {
    const normalizedSelfDescription = facts.selfDescription.trim();
    const normalizedDemo = DEFAULT_SELF_DESCRIPTION_DEMO.trim();
    const hasCustomizedSelfDescription =
      normalizedSelfDescription.length > 0 && normalizedSelfDescription !== normalizedDemo;

    if (!hasCustomizedSelfDescription) {
      return {
        id: 'onboarding_set_self_description',
        type: 'onboarding_step',
        priority: 'high',
        title: '让 AI 先认识一下你',
        description: '当前还是示例内容，随手写几句你的日常消费偏好，后面的分类会准很多。',
        dismissible: true,
        action: {
          kind: 'navigate',
          target: 'settings_self_description',
          label: '去设置',
        },
      };
    }

    if (!facts.hasMonthlyBudget) {
      return {
        id: 'onboarding_set_monthly_budget',
        type: 'onboarding_step',
        priority: 'high',
        title: '设个月预算吧',
        description: '有了预算，首页会帮你追踪这个月花了多少、还剩多少空间，不用自己算。',
        dismissible: true,
        action: {
          kind: 'navigate',
          target: 'settings_budget',
          label: '去设置',
        },
      };
    }

    if (!facts.hasImportedTransactions) {
      return {
        id: 'onboarding_import_bill',
        type: 'onboarding_step',
        priority: 'high',
        title: '把账单导进来',
        description: '导入微信或支付宝的账单，首页就有真实记录，AI 也能开始帮你整理分类。',
        dismissible: true,
        action: {
          kind: 'navigate',
          target: 'entry_import',
          label: '去导入',
        },
      };
    }

    if (!facts.onboardingState.onboarding.hasStartedAiProcessing) {
      return {
        id: 'onboarding_start_ai_classification',
        type: 'onboarding_step',
        priority: 'high',
        title: '让 AI 帮你整理一次',
        description: '长按底部首页图标，往上滑到「开启」就好。第一次运行可能要稍等一下，不用担心。',
        dismissible: true,
        action: null,
      };
    }

    if (!facts.onboardingState.onboarding.hasCompletedPostAiInteraction) {
      return {
        id: 'onboarding_learn_post_ai_interaction',
        type: 'onboarding_step',
        priority: 'high',
        title: '分类有不对的，随时可以改',
        description: '长按条目拖到分类区域可以调整分类，点一下可以看详情或加备注。',
        dismissible: true,
        action: null,
      };
    }

    return null;
  }

  /**
   * 构造账单导入提醒卡。
   *
   * 触发条件：
   * 1. 用户已有过至少一次导入记录（hasImportedTransactions === true）
   * 2. lastBillImportAt 有记录
   * 3. 距上次导入已超过 3 天
   *
   * 文案规则：
   * - 3–7 天：显示具体天数，"距上次导入已 X 天"
   * - 8–30 天：显示周数，"X 周没有导入了"
   * - 31+ 天：显示月数，"X 个月没有导入了"
   */
  private static buildImportReminderCard(facts: HomeHintFacts): HomeHintCardReadModel | null {
    if (!facts.hasImportedTransactions || !facts.lastBillImportAt) {
      return null;
    }

    const lastAt = new Date(facts.lastBillImportAt);
    const now = new Date();
    const days = Math.floor((now.getTime() - lastAt.getTime()) / 86_400_000);

    if (days <= 3) {
      return null;
    }

    let description: string;
    if (days <= 7) {
      description = `距上次导入已 ${days} 天，趁早把账单补上。`;
    } else if (days <= 30) {
      const weeks = Math.floor(days / 7);
      description = `${weeks} 周没有导入了，要补一下吗？`;
    } else {
      const months = Math.floor(days / 30);
      description = `${months} 个月没有导入了，数据会有空缺。`;
    }

    return {
      id: 'import_reminder',
      type: 'import_reminder',
      priority: 'medium',
      title: '好久没导入账单了',
      description,
      dismissible: true,
      action: {
        kind: 'navigate',
        target: 'entry_import',
        label: '去导入',
      },
    };
  }

  /**
   * 把预算系统现有提示卡映射到首页统一卡片结构。
   * 需要动作按钮的预算卡在这里集中补齐。
   */
  private static mapBudgetHint(hint: BudgetHintCard): HomeHintCardReadModel {
    if (hint.id === 'budget_setup_nudge') {
      return {
        id: hint.id,
        type: hint.type,
        priority: hint.priority,
        title: '要不要设个月预算？',
        description: '你已经记了一段时间的账了。加个月预算，这个月的消费节奏一眼就能看清楚。',
        dismissible: hint.dismissible,
        action: {
          kind: 'navigate',
          target: 'settings_budget',
          label: '去设置',
        },
      };
    }

    if (hint.id === 'category_budget_invalidated') {
      return {
        id: hint.id,
        type: hint.type,
        priority: hint.priority,
        title: '分类预算需要更新一下',
        description: '你调整过分类，原来的分类预算已经不匹配了，重新设一下就好。',
        dismissible: hint.dismissible,
        action: {
          kind: 'navigate',
          target: 'settings_budget',
          label: '去设置',
        },
      };
    }

    return {
      id: hint.id,
      type: hint.type,
      priority: hint.priority,
      title: hint.title,
      description: hint.description,
      dismissible: hint.dismissible,
      action: null,
    };
  }
}
