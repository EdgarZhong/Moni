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
        title: '先把自述改成你自己的',
        description: '现在还是默认示例文案。先改成你的真实习惯，AI 后面才会更懂你。',
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
        title: '先设一个月预算',
        description: '有了总预算，首页才会开始显示预算进度和节奏提醒。',
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
        title: '先导入一份账单',
        description: '导入后首页才会有真实流水，后面的 AI 分类也才能开始。',
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
        title: '试着开启 AI 分类',
        description: '长按底部导航栏首页图标，并向上滑动手指到“开启”。',
        dismissible: true,
        action: null,
      };
    }

    if (!facts.onboardingState.onboarding.hasCompletedPostAiInteraction) {
      return {
        id: 'onboarding_learn_post_ai_interaction',
        type: 'onboarding_step',
        priority: 'high',
        title: '学会怎么修正分类',
        description: '长按条目，拖拽到分类框以修改分类；单击条目可查看详情。',
        dismissible: true,
        action: null,
      };
    }

    return null;
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
        title: '要不要设一个月预算？',
        description: '你已经有一段时间的流水了，设个预算会更好用。',
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
        title: '分类预算需要重新设置',
        description: '标签结构变了，原来的分类预算已经失效。',
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
