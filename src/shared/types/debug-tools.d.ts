interface Window {
  /**
   * Moni 浏览器开发态调试入口。
   * 负责数据准备、逻辑链路调用、状态快照读取。
   */
  __MONI_DEBUG__?: unknown;

  /**
   * Moni 浏览器开发态标准测试入口。
   * 负责一键执行标准 smoke test / 端到端逻辑测试。
   */
  __MONI_E2E__?: unknown;

  /**
   * 历史遗留调试入口占位。
   * 继续保留声明，避免旧代码或旧控制台脚本报类型错误。
   */
  __DEBUG_TOOLS__?: unknown;
}
