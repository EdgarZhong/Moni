/**
 * Moni 触觉反馈平台层
 *
 * 封装触觉反馈调用，通过 HapticsService 适配器统一分发。
 * 迁移自 Moni-UI-Prototype/src/platform/haptics.js，
 * 原版直接调用 globalThis.Capacitor.Plugins.Haptics，
 * 迁移后改为通过 Moni 适配器层（HapticsService）调用，
 * 支持 Capacitor / Web Vibration API / Noop 三种平台。
 */

import { HapticsService } from "@system/adapters/HapticsService";
import { HapticImpactStyle } from "@system/adapters/IHapticsAdapter";

// ──────────────────────────────────────────────
// 强度映射
// ──────────────────────────────────────────────

/** 将 Moni 原始风格字符串映射到适配器接口的 HapticImpactStyle */
const IMPACT_STYLE_MAP: Record<string, HapticImpactStyle> = {
  light:  HapticImpactStyle.Light,
  medium: HapticImpactStyle.Medium,
  heavy:  HapticImpactStyle.Heavy,
};

// ──────────────────────────────────────────────
// 公共 API
// ──────────────────────────────────────────────

/**
 * 触发冲击型触觉反馈
 *
 * @param style 反馈强度 "light" | "medium" | "heavy"，默认 "light"
 * @returns 是否成功触发（不支持的平台返回 false）
 */
export async function triggerImpact(style: "light" | "medium" | "heavy" = "light"): Promise<boolean> {
  try {
    const haptics = HapticsService.getInstance();
    if (!haptics.isSupported()) {
      return false;
    }
    const mappedStyle = IMPACT_STYLE_MAP[style] ?? HapticImpactStyle.Light;
    await haptics.impact(mappedStyle);
    return true;
  } catch {
    return false;
  }
}
