# Android 返回手势卡点情况说明与外部求助报告

## 一、报告目的

本文档用于向外部更强模型 / 检索系统说明 Moni 当前 Android 返回手势问题的上下文、现状、已尝试路径与待解问题，避免外部分析时因为缺少代码库背景而给出失焦建议。

本报告**只聚焦 Android 返回手势 / 系统返回键问题**，不混入分类引擎消费异常。

## 二、项目与代码库必要背景

### 1. 项目形态

- 项目名：`Moni`
- 技术栈：`React 19 + TypeScript + Vite + Capacitor Android`
- Android 依赖版本：
  - `@capacitor/android: ^8.0.1`
  - `@capacitor/core: ^8.0.1`
- 运行模式：
  - Web 层 UI 运行在 Capacitor WebView 中
  - Android 原生层当前基本保持最小宿主，不做复杂原生页面栈

### 2. 当前页面架构

应用不是 Android 原生多 Activity / 多 Fragment 导航，而是**单 Activity + Web 内部页面状态切换**：

- 一级页面只有三个：`home / entry / settings`
- 一级页面切换由 React 状态控制，不是原生路由
- 大量“二级页面”其实是 Web 内部覆盖层 / 详情页 / 面板，而不是原生页面跳转

相关文件：

- `src/bootstrap/AppRoot.tsx`
- `src/ui/pages/MoniHome.tsx`
- `src/ui/pages/MoniEntry.tsx`
- `src/ui/pages/MoniSettings.tsx`
- `src/ui/features/moni-home/TransactionDetailPage.tsx`

### 3. 当前设计目标

Android 系统返回手势 / 返回键的目标行为是：

1. 若当前有二级页 / 覆盖层打开，应优先关闭最上层二级内容
2. 若当前位于一级页且没有二级层：
   - 第一次返回：提示“再次返回退出应用”
   - 第二次返回：退出应用
3. 不能出现“二级页还开着，但系统手势直接退桌面”的行为

## 三、当前实现方案

### 1. JS 返回栈设计

当前仓库实现了一套**纯 Web 层返回栈**：

- `src/system/device/backHandler.ts`
  - `pushBackHandler(fn)`
  - `popBackHandler(fn)`
  - `invokeTopBackHandler()`
- 设计语义：
  - 二级页 / 覆盖层挂载时注册关闭函数
  - 卸载时弹出
  - Android 返回事件到来时，优先执行栈顶 handler

这是一个**内存栈**，不是原生返回栈。

### 2. React hook 包装

- `src/ui/hooks/useBackHandler.ts`

作用：

- 组件挂载时注册 handler
- 组件卸载时自动移除
- `active = false` 时不注册

### 3. AppRoot 中的系统返回接入

- `src/bootstrap/AppRoot.tsx`

当前做法：

1. 用 `registerPlugin('App')` 拿到 Capacitor `App` 插件
2. 在 `useEffect` 中监听：
   - `CapacitorApp.addListener('backButton', ...)`
3. 收到事件后：
   - 先执行 `invokeTopBackHandler()`
   - 如果没有二级 handler 处理，则执行“双击返回退出应用”逻辑
4. 第二次返回时调用：
   - `CapacitorApp.exitApp()`

### 4. 当前原生层状态

- `android/app/src/main/java/com/moni/app/MainActivity.java`

当前只有最小实现：

```java
package com.moni.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

也就是说：

- 没有自定义 `onBackPressed()`
- 没有接入 `OnBackPressedDispatcher`
- 没有接入 Android 13+ `OnBackInvokedDispatcher`
- 没有任何原生侧日志、桥接或兜底处理

## 四、当前哪些页面已接入返回栈

已确认接入的典型位置：

- `src/ui/pages/MoniHome.tsx`
  - 日期范围对话框
  - 理由对话框
  - 拖拽蒙版
- `src/ui/pages/MoniEntry.tsx`
  - 导入指南页
  - 压缩包密码页
  - 表单覆盖层
  - 分类选择覆盖层
- `src/ui/features/moni-home/TransactionDetailPage.tsx`
  - 分类模态框关闭
  - 否则关闭详情页

这说明问题**大概率不在“所有二级层都没注册 handler”**，因为核心二级层已接入。

## 五、当前真实问题现象

用户在 Android 真机上反馈：

- 系统返回手势仍会**直接退桌面**
- 预期中的“先关闭二级页 / 再一级页双击退出”并没有稳定发生
- 这个问题此前已经尝试过多次修补，但都没有真正闭环

浏览器开发态无法等价复现，因为：

- 浏览器没有 Android 系统返回手势
- 浏览器中也没有 Capacitor 原生 `backButton` 事件链路

因此该问题具有明显的**原生宿主 / Capacitor 桥接 / Android 系统行为**属性。

## 六、我们已经尝试过的路径

### 1. 建立统一 JS 返回栈

已做：

- 新增 `backHandler` 全局栈
- 各二级页面通过 `useBackHandler()` 注册关闭行为

结论：

- 这一步只解决了“**如果事件能到达 JS**，由谁来处理”的问题
- 它**没有证明 Android 手势事件真的稳定到达 JS**

### 2. 在 AppRoot 监听 Capacitor `backButton`

已做：

- 在 `AppRoot` 中注册 `CapacitorApp.addListener('backButton', ...)`
- 事件到达后优先调用 `invokeTopBackHandler()`
- 栈空时执行“双击返回退出应用”

结论：

- 从代码设计上看，Web 层返回策略已经基本完整
- 但真机表现说明：**要么监听没有被触发，要么系统默认返回行为先于 JS 逻辑生效**

### 3. Root 架构重构后继续沿用这套方案

项目近期已经做过 Root 架构重构，页面级 header 下放，Overlay Host / Chrome Controller / State Host 分层更清晰；但这次重构**没有引入新的原生返回接管层**。

结论：

- 当前问题并不是简单的 UI 结构脏乱导致的“页面关不掉”
- 问题更像是：**Android 系统返回链路并没有被这套 JS 方案真正接住**

## 七、当前最关键的判断

### 判断 1：问题很可能不在“返回栈设计本身”

理由：

- 返回栈模型很简单，且核心二级层已经接入
- 如果 `backButton` 事件能正常进入 JS，这套栈至少应该让若干二级层先关闭
- 但现在出现的是“直接退桌面”，说明更上游就可能失效

### 判断 2：问题更可能在“Android 返回事件 -> Capacitor -> JS”的桥接链路

当前原生层完全没有自定义 back handling，只靠：

- `BridgeActivity`
- `registerPlugin('App')`
- `App.addListener('backButton')`

这就带来几个高风险假设：

1. **Android 手势返回并不一定等价于旧式返回键事件**
2. **Capacitor 8 在当前宿主配置下是否稳定把手势返回上抛到 `backButton`，并不明确**
3. **Android 13+ predictive back / back invoked 机制可能需要额外原生接入**
4. **BridgeActivity 默认行为可能已先执行 finish / back，再导致 JS 来不及接管**

### 判断 3：这是一个需要外部资料支撑的问题

因为当前仓库里没有足够原生代码，也没有现成文档说明：

- Capacitor 8 在 Android 手势返回下的标准接法
- 是否必须安装 / 引入正式的 `@capacitor/app` 插件能力
- 是否需要在原生 `MainActivity` 中做 dispatcher 级拦截
- 是否需要 AndroidManifest 或 Activity 配置配合

## 八、请外部模型重点回答的问题

以下问题是本次求助最核心的部分。

### 问题 A：Capacitor 8 下，Android 系统返回手势是否应天然触发 `App.addListener('backButton')`？

请明确回答：

- Android 13 / 14 / 15 的手势返回，是否会稳定映射到 Capacitor `backButton`
- 是否存在“物理返回键可触发，但边缘返回手势不触发”的已知差异
- 如果存在，需要什么官方推荐做法

### 问题 B：在 `BridgeActivity` 最小宿主下，是否必须显式引入原生 back dispatcher？

我们当前的 `MainActivity` 是：

```java
public class MainActivity extends BridgeActivity {}
```

请分析：

- 这种最小实现是否足够
- 是否需要改为接管：
  - `OnBackPressedDispatcher`
  - `OnBackInvokedDispatcher`
  - 其他 Capacitor 官方推荐 API
- 如果要接，推荐实现方式是什么

### 问题 C：如果应用是“单 Activity + Web 内部多页面/覆盖层”，官方推荐的 Android 返回接管模式是什么？

因为我们没有原生路由栈，只有 Web 内部状态栈。请回答：

- Android 返回手势进入后，如何让它优先交给 Web 层“覆盖层关闭逻辑”
- 当 Web 层没有可消费返回时，再如何安全退出 App
- 这种模式下是否建议完全避免 `exitApp()`，还是继续允许双击退出

### 问题 D：当前这段接法是否有明显错误或不完整之处？

当前关键逻辑是：

1. `registerPlugin('App')`
2. `addListener('backButton', ...)`
3. JS 内存栈 `invokeTopBackHandler()`
4. 栈空则双击退出 `exitApp()`

请判断：

- 是否应改为正式 import `@capacitor/app`
- 是否不应仅靠 `registerPlugin('App')`
- 是否应在原生层先拦截，再通过 bridge 主动通知 Web 层
- 是否存在 Capacitor 8 的推荐模板或官方 sample

### 问题 E：如果要真正修复，建议最小可行落地方案是什么？

希望外部模型给出：

1. 最小可行原生改动方案
2. 对应 Web 层改动方案
3. Android 13+ predictive back 是否需要特殊兼容
4. 如何验证修复真的生效

## 九、建议外部模型关注的关键文件

请外部分析时优先阅读这些文件：

- `package.json`
- `src/bootstrap/AppRoot.tsx`
- `src/system/device/backHandler.ts`
- `src/ui/hooks/useBackHandler.ts`
- `src/ui/pages/MoniHome.tsx`
- `src/ui/pages/MoniEntry.tsx`
- `src/ui/features/moni-home/TransactionDetailPage.tsx`
- `android/app/src/main/java/com/moni/app/MainActivity.java`

## 十、我们当前最需要的不是“另一个 JS 技巧”，而是“原生事件链是否正确接入”的结论

请外部模型不要只从 React / hook / 状态管理角度回答。我们当前更需要的是：

- Capacitor 8 与 Android 返回手势的官方行为说明
- 是否需要原生接管
- 如果需要，具体接哪一层
- 单 Activity + Web 状态栈场景下的推荐实现

## 十一、附：当前关键代码摘录

### 1. 返回栈

`src/system/device/backHandler.ts`

```ts
const _handlers: (() => void)[] = [];

export function pushBackHandler(fn: () => void): void {
  _handlers.push(fn);
}

export function popBackHandler(fn: () => void): void {
  const idx = _handlers.lastIndexOf(fn);
  if (idx !== -1) {
    _handlers.splice(idx, 1);
  }
}

export function invokeTopBackHandler(): boolean {
  if (_handlers.length === 0) return false;
  _handlers[_handlers.length - 1]();
  return true;
}
```

### 2. hook 封装

`src/ui/hooks/useBackHandler.ts`

```ts
export function useBackHandler(handler: () => void, active = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;

    const stable = () => handlerRef.current();

    pushBackHandler(stable);
    return () => popBackHandler(stable);
  }, [active]);
}
```

### 3. AppRoot 接系统返回

`src/bootstrap/AppRoot.tsx`

```ts
useEffect(() => {
  if (!Capacitor.isNativePlatform() || !canRegisterNativeBackButtonListener()) return;

  let listenerHandle: { remove: () => Promise<void> } | null = null;

  const registerBack = async () => {
    listenerHandle = await CapacitorApp.addListener('backButton', () => {
      if (invokeTopBackHandler()) return;

      const now = Date.now();
      if (now - lastBackTimeRef.current < 2000) {
        if (exitToastTimerRef.current != null) clearTimeout(exitToastTimerRef.current);
        setExitToastVisible(false);
        void CapacitorApp.exitApp();
      } else {
        lastBackTimeRef.current = now;
        setExitToastVisible(true);
        if (exitToastTimerRef.current != null) clearTimeout(exitToastTimerRef.current);
        exitToastTimerRef.current = setTimeout(() => {
          setExitToastVisible(false);
          exitToastTimerRef.current = null;
        }, 2000);
      }
    });
  };

  void registerBack();

  return () => {
    if (exitToastTimerRef.current != null) clearTimeout(exitToastTimerRef.current);
    void listenerHandle?.remove();
  };
}, []);
```

### 4. 原生宿主

`android/app/src/main/java/com/moni/app/MainActivity.java`

```java
package com.moni.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

## 十二、结论

当前 Moni 的 Android 返回问题，表面上像“某个页面没处理返回”，但结合代码和现象看，更大的概率是：

- **JS 返回栈已经有了**
- **二级层注册也已经做了**
- **真正缺的是 Android 手势返回到 Web 逻辑的可靠桥接与宿主级接管**

因此，外部分析应重点回答“Capacitor 8 + Android 手势返回 + 单 Activity Web 状态栈”的正确做法，而不是继续只在 React 层兜圈子。
