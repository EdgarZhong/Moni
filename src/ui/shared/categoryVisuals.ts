/**
 * 分类视觉自动分配系统
 *
 * 目标：
 * 1. 继续保持现有默认分类的既有视觉风格不漂移；
 * 2. 让新增默认分类与用户自定义分类也能稳定拿到颜色、底色、概览色与图标组；
 * 3. 首页、详情页、记账页只消费这一处输出，避免继续散落硬编码映射表。
 *
 * 设计约束：
 * - `?` 只保留给未分类状态，不属于任何已分类标签；
 * - 图标优先按“分类键 + 分类描述”的语义正则匹配；
 * - 颜色使用大调色盘稳定分配，同一账本内尽量避免碰撞；
 * - 现有默认分类通过同一个解析器命中稳定视觉结果，而不是 UI 层再写第二套特殊逻辑。
 */

import type { LedgerCategoryDefinition } from "@shared/types";

/**
 * 单个分类在 UI 中需要的完整视觉信息。
 * `overviewColor` 单独保留，避免概览横条直接复用文字色后显得过重。
 */
export interface CategoryVisual {
  readonly key: string;
  readonly color: string;
  readonly bg: string;
  readonly overviewColor: string;
  readonly icons: readonly string[];
  readonly semanticGroup: string;
}

/**
 * 未分类状态的专属视觉。
 * 这里故意与普通分类分开，确保问号不会泄露到任何已分类标签。
 */
export const UNCLASSIFIED_CATEGORY_VISUAL = {
  color: "#D85A30",
  bg: "#FFF5EB",
  overviewColor: "#E88B4D",
  icon: "?",
} as const;

/**
 * 统一的中性回退图标组。
 * 当标签已经分类，但语义确实无法判断时，用这一组兜底；
 * 这样视觉上仍然表达“已归类”，而不是误导成“待分类”。
 */
const GENERIC_ICON_GROUP = ["🏷️", "🗂️", "📌", "🧾"] as const;

/**
 * 大调色盘。
 * 每一项同时给出文字主色、浅底色和概览条使用的中等饱和度色值。
 * 数量刻意做大，尽量覆盖用户自定义标签增长后的碰撞风险。
 */
const CATEGORY_TONE_PALETTE = [
  { color: "#D85A30", bg: "#FFF0F0", overviewColor: "#FF6B6B" },
  { color: "#854F0B", bg: "#FFF8EB", overviewColor: "#F3C86B" },
  { color: "#185FA5", bg: "#EBF5FF", overviewColor: "#7EC8E3" },
  { color: "#7B2D8B", bg: "#F6EEFA", overviewColor: "#C8A7E8" },
  { color: "#8B2252", bg: "#FFF0F5", overviewColor: "#E7A0AE" },
  { color: "#1A7A4C", bg: "#EEFAF3", overviewColor: "#77D7BF" },
  { color: "#534AB7", bg: "#F3EEFA", overviewColor: "#AFA5E6" },
  { color: "#2D6A9F", bg: "#EDF5FC", overviewColor: "#93C4EA" },
  { color: "#6B5B3E", bg: "#FBF6EE", overviewColor: "#C9B18E" },
  { color: "#0E7C6B", bg: "#E8FAF5", overviewColor: "#87D7C4" },
  { color: "#1F7A6B", bg: "#EAFBF7", overviewColor: "#56C7A7" },
  { color: "#9A4E13", bg: "#FFF4E9", overviewColor: "#F1A55D" },
  { color: "#3559B6", bg: "#EEF2FF", overviewColor: "#7F9AF5" },
  { color: "#A24374", bg: "#FFF0F7", overviewColor: "#E79AC0" },
  { color: "#0F6A88", bg: "#EAF8FD", overviewColor: "#69C8E6" },
  { color: "#5B7A14", bg: "#F4FBE7", overviewColor: "#A8D85F" },
  { color: "#8B5E13", bg: "#FFF9E8", overviewColor: "#E5C45A" },
  { color: "#4D5E78", bg: "#F1F4F8", overviewColor: "#A9B5C6" },
  { color: "#7A3E9D", bg: "#F7F0FF", overviewColor: "#C6A0F0" },
  { color: "#146B56", bg: "#E9FAF4", overviewColor: "#74D8B9" },
  { color: "#A14C3A", bg: "#FFF1EC", overviewColor: "#F1A490" },
  { color: "#6A48A8", bg: "#F4F0FF", overviewColor: "#B8A0E8" },
  { color: "#0D7C87", bg: "#E8FAFB", overviewColor: "#70D7E2" },
  { color: "#8C3A59", bg: "#FFF0F4", overviewColor: "#E79BB2" },
  { color: "#2F6B3F", bg: "#EEF9F1", overviewColor: "#8FD19B" },
  { color: "#9A6A14", bg: "#FFF8E8", overviewColor: "#E9C96D" },
  { color: "#3F5E9A", bg: "#EFF4FF", overviewColor: "#95AEEB" },
  { color: "#6E5878", bg: "#F5F1F8", overviewColor: "#C2B5CC" },
  { color: "#165B73", bg: "#EAF6FB", overviewColor: "#84C8E0" },
  { color: "#7A6A2D", bg: "#FCFAEC", overviewColor: "#D9CB7B" },
] as const;

/**
 * 现有默认分类当前已经在线上界面形成稳定认知。
 * 这里保留它们现有的色值与图标组，确保新系统接入后视觉不抖动。
 *
 * 注意：
 * 这仍然属于“同一个解析器的数据样本”，不是 UI 层分叉出第二套规则。
 */
const LEGACY_COMPAT_VISUALS: Record<string, Omit<CategoryVisual, "key" | "semanticGroup">> = {
  正餐: { color: "#D85A30", bg: "#FFF0F0", overviewColor: "#FF6B6B", icons: ["🍜", "🍱", "🍚", "🥡"] },
  零食: { color: "#854F0B", bg: "#FFF8EB", overviewColor: "#F3C86B", icons: ["☕", "🧋", "🍪", "🍦"] },
  交通: { color: "#185FA5", bg: "#EBF5FF", overviewColor: "#7EC8E3", icons: ["🚇", "🚕", "⛽", "🚌"] },
  娱乐: { color: "#7B2D8B", bg: "#F6EEFA", overviewColor: "#C8A7E8", icons: ["🎬", "🎮", "🎵", "🎭"] },
  大餐: { color: "#8B2252", bg: "#FFF0F5", overviewColor: "#E7A0AE", icons: ["🍷", "🥘", "🦞", "🍣"] },
  健康: { color: "#1A7A4C", bg: "#EEFAF3", overviewColor: "#77D7BF", icons: ["💊", "🏥", "💪", "🧘"] },
  购物: { color: "#534AB7", bg: "#F3EEFA", overviewColor: "#AFA5E6", icons: ["🛍️", "📦", "👕", "🎁"] },
  教育: { color: "#2D6A9F", bg: "#EDF5FC", overviewColor: "#93C4EA", icons: ["📚", "🎓", "✏️", "💻"] },
  居住: { color: "#6B5B3E", bg: "#FBF6EE", overviewColor: "#C9B18E", icons: ["🏠", "💡", "🔧", "🚿"] },
  旅行: { color: "#0E7C6B", bg: "#E8FAF5", overviewColor: "#87D7C4", icons: ["✈️", "🏨", "🎫", "🗺️"] },
  其他: { color: "#666666", bg: "#F5F5F5", overviewColor: "#C5C5C5", icons: ["📝", "💰", "🔖", "📌"] },
};

/**
 * 图标语义组。
 * 每一组只解决“图标应该长得像什么”，不直接决定最终颜色，
 * 这样同语义的自定义标签也能保留图标相关性，同时仍拿到自己的专属色。
 */
const SEMANTIC_ICON_GROUPS: Array<{
  readonly id: string;
  readonly patterns: readonly RegExp[];
  readonly icons: readonly string[];
}> = [
  { id: "income", patterns: [/收入|工资|薪资|奖金|佣金|分红|利息|收益|报销|补贴|收款|入账|稿费|副业|结算/u], icons: ["💴", "💵", "🪙", "🏦"] },
  { id: "refund", patterns: [/退款|返现|返还|退费|售后|冲回|撤销|赔付|退货/u], icons: ["↩️", "🧾", "💳", "📮"] },
  { id: "meal", patterns: [/正餐|餐饮|早餐|午餐|晚餐|便当|盒饭|盖饭|面馆|火锅|烧烤|饭|面|粉|馄饨|麻辣烫/u], icons: ["🍜", "🍱", "🍚", "🥡"] },
  { id: "snack", patterns: [/零食|饮品|奶茶|咖啡|甜品|下午茶|小吃|点心|蛋糕|冰淇淋|面包|宵夜/u], icons: ["☕", "🧋", "🍪", "🍦"] },
  { id: "transport", patterns: [/交通|通勤|地铁|公交|打车|滴滴|加油|停车|火车|高铁|过路费|出行/u], icons: ["🚇", "🚕", "⛽", "🚌"] },
  { id: "travel", patterns: [/旅行|旅游|度假|酒店|民宿|景点|门票|签证|航班|机票|旅拍/u], icons: ["✈️", "🏨", "🎫", "🗺️"] },
  { id: "entertainment", patterns: [/娱乐|电影|游戏|演出|音乐|剧场|ktv|酒吧|动漫|会员|直播/u], icons: ["🎬", "🎮", "🎵", "🎭"] },
  { id: "shopping", patterns: [/购物|网购|超市|百货|服饰|衣服|鞋|包|日用|家居|淘宝|京东|拼多多/u], icons: ["🛍️", "📦", "👕", "🎁"] },
  { id: "health", patterns: [/健康|医疗|医院|药|体检|保健|健身|理疗|牙科|诊所/u], icons: ["💊", "🏥", "💪", "🧘"] },
  { id: "education", patterns: [/教育|学习|课程|培训|考试|学费|教材|书籍|阅读|证书/u], icons: ["📚", "🎓", "✏️", "💻"] },
  { id: "housing", patterns: [/居住|房租|租房|物业|水电|燃气|家电|装修|搬家|宽带|维修/u], icons: ["🏠", "💡", "🔧", "🚿"] },
  { id: "feast", patterns: [/大餐|聚餐|宴请|餐厅|酒馆|海鲜|寿司|牛排/u], icons: ["🍷", "🥘", "🦞", "🍣"] },
  { id: "work", patterns: [/办公|工作|软件|工具|订阅|服务器|域名|开发|素材|协作/u], icons: ["💻", "🧰", "🗃️", "⌨️"] },
  { id: "finance", patterns: [/理财|基金|股票|保险|税|还款|贷款|账单|金融|信用卡/u], icons: ["📈", "💹", "💳", "🧮"] },
  { id: "beauty", patterns: [/护肤|美妆|美容|理发|美发|化妆|香水/u], icons: ["💄", "🧴", "💇", "🪞"] },
  { id: "pet", patterns: [/宠物|猫|狗|猫粮|狗粮|宠物医院/u], icons: ["🐾", "🐈", "🐕", "🦴"] },
  { id: "family", patterns: [/母婴|宝宝|育儿|儿童|家庭|亲子/u], icons: ["🍼", "🧸", "👨‍👩‍👧", "🎈"] },
  { id: "gift", patterns: [/礼物|礼品|送礼|人情|婚礼|红包/u], icons: ["🎁", "💌", "🎊", "🌷"] },
  { id: "charity", patterns: [/公益|捐赠|捐款|慈善/u], icons: ["🤝", "❤️", "🕊️", "🌱"] },
];

/**
 * 标准化分类定义输入。
 * 账本当前有的分类、以及列表里偶发出现但当前定义中已缺失的分类，
 * 都会通过这一层先去重，避免同一个分类被重复分配颜色。
 */
function normalizeCategoryInputs(
  inputs: ReadonlyArray<LedgerCategoryDefinition | { key: string; description?: string | null } | string>,
): Array<{ key: string; description: string }> {
  const seen = new Set<string>();
  const normalized: Array<{ key: string; description: string }> = [];

  for (const input of inputs) {
    const key = typeof input === "string" ? input.trim() : input.key.trim();
    if (!key || key === "uncategorized" || key === "未分类" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      key,
      description: typeof input === "string" ? "" : (input.description ?? "").trim(),
    });
  }

  return normalized;
}

/**
 * 简单稳定哈希。
 * 不追求密码学强度，只要求：
 * - 同一分类每次得到同一结果；
 * - 中文 key 也能稳定参与分配；
 * - 分布尽量均匀，减少自定义标签在调色盘里的扎堆。
 */
function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 在大调色盘中为当前分类挑选颜色。
 * 先按 hash 锚定起点，再用另一个 hash 生成步长；
 * 如果当前颜色已被前面的分类占用，就沿着步长继续探测，尽量避免账本内撞色。
 */
function pickToneIndex(key: string, description: string, usedIndexes: Set<number>): number {
  const paletteSize = CATEGORY_TONE_PALETTE.length;
  const base = stableHash(`${key}|${description}`) % paletteSize;
  const step = (stableHash(`${key}|${description}|step`) % (paletteSize - 1)) + 1;

  let candidate = base;
  for (let attempt = 0; attempt < paletteSize; attempt += 1) {
    if (!usedIndexes.has(candidate)) {
      return candidate;
    }
    candidate = (candidate + step) % paletteSize;
  }

  return base;
}

/**
 * 用分类键与描述做语义匹配，选出最合适的图标组。
 * 匹配失败时退回中性图标，不再把未知分类伪装成未分类。
 */
function pickSemanticIcons(key: string, description: string): { semanticGroup: string; icons: readonly string[] } {
  const haystack = `${key} ${description}`.trim();
  for (const group of SEMANTIC_ICON_GROUPS) {
    if (group.patterns.some((pattern) => pattern.test(haystack))) {
      return {
        semanticGroup: group.id,
        icons: group.icons,
      };
    }
  }

  return {
    semanticGroup: "generic",
    icons: GENERIC_ICON_GROUP,
  };
}

/**
 * 尝试把既有默认分类占用的色值映射回调色盘索引。
 * 这样后续动态标签分配时就会主动绕开这些槽位，尽量减少与默认标签撞色。
 */
function findToneIndexByColor(color: string, bg: string, overviewColor: string): number {
  return CATEGORY_TONE_PALETTE.findIndex(
    (tone) => tone.color === color && tone.bg === bg && tone.overviewColor === overviewColor,
  );
}

/**
 * 构建当前账本的分类视觉注册表。
 * 这是页面层真正应该缓存并复用的对象：
 * - 一次构建后，首页/详情页/记账页都读同一份；
 * - 已分类标签一定有颜色和图标；
 * - 现有默认标签继续保持旧视觉，自定义标签则稳定扩展。
 */
export function buildCategoryVisualRegistry(
  inputs: ReadonlyArray<LedgerCategoryDefinition | { key: string; description?: string | null } | string>,
): Record<string, CategoryVisual> {
  const normalizedInputs = normalizeCategoryInputs(inputs);
  const usedToneIndexes = new Set<number>();
  const registry: Record<string, CategoryVisual> = {};

  for (const { key, description } of normalizedInputs) {
    const legacyVisual = LEGACY_COMPAT_VISUALS[key];
    if (legacyVisual) {
      const legacyToneIndex = findToneIndexByColor(legacyVisual.color, legacyVisual.bg, legacyVisual.overviewColor);
      if (legacyToneIndex >= 0) {
        usedToneIndexes.add(legacyToneIndex);
      }
      registry[key] = {
        key,
        color: legacyVisual.color,
        bg: legacyVisual.bg,
        overviewColor: legacyVisual.overviewColor,
        icons: legacyVisual.icons,
        semanticGroup: `legacy:${key}`,
      };
      continue;
    }

    const toneIndex = pickToneIndex(key, description, usedToneIndexes);
    usedToneIndexes.add(toneIndex);
    const tone = CATEGORY_TONE_PALETTE[toneIndex];
    const semantic = pickSemanticIcons(key, description);

    registry[key] = {
      key,
      color: tone.color,
      bg: tone.bg,
      overviewColor: tone.overviewColor,
      icons: semantic.icons,
      semanticGroup: semantic.semanticGroup,
    };
  }

  return registry;
}

/**
 * 解析单个分类的视觉信息。
 * 优先读当前页面已经构建好的 registry；
 * 若调用方只拿到了一个孤立分类名，也允许退回单分类即时解析，避免界面出现空白。
 */
export function resolveCategoryVisual(
  category: string | null | undefined,
  registry?: Record<string, CategoryVisual>,
): CategoryVisual | null {
  if (!category || category === "uncategorized" || category === "未分类") {
    return null;
  }

  const existing = registry?.[category];
  if (existing) {
    return existing;
  }

  return buildCategoryVisualRegistry([category])[category] ?? null;
}

/**
 * 从分类视觉里取一个稳定图标变体。
 * 条目列表会根据索引轮换图标，拖拽投放格与详情页则通常取第一枚。
 */
export function pickCategoryIcon(
  visual: CategoryVisual | null,
  variantIndex = 0,
): string {
  if (!visual || visual.icons.length === 0) {
    return GENERIC_ICON_GROUP[0];
  }
  return visual.icons[Math.abs(variantIndex) % visual.icons.length] ?? GENERIC_ICON_GROUP[0];
}
