import type { ReactNode } from 'react';
import { HomeSummaryPrototype } from '../../../design/prototypes/home-summary/HomeSummaryPrototype';

type PrototypeEntry = {
  id: string;
  title: string;
  summary: string;
  brief: string;
  component: ReactNode;
};

const prototypeEntries: PrototypeEntry[] = [
  {
    id: 'home-summary',
    title: 'Home Summary',
    summary: '首页主舞台的轻量示例原型，用于验证 design 工作台与局部审查机制。',
    brief: 'design/briefs/accepted/design-workbench-bootstrap.md',
    component: <HomeSummaryPrototype />,
  },
];

/**
 * 开发态 `__design` 入口。
 * 这里只承接 design prototype 的浏览与审查，不连接真实业务逻辑。
 */
export function DesignWorkbench() {
  return (
    <div style={{ minHeight: '100vh', background: '#f4efe3', color: '#1f2430' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 48px' }}>
        <header style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>Moni /__design</div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#4b5563', maxWidth: 860 }}>
            这里是开发态设计工作台，只展示 `design/prototypes` 下的局部原型。正式实现请只参考 accepted brief 与已拍板的 design baseline。
          </div>
        </header>

        <section style={{ display: 'grid', gap: 16 }}>
          {prototypeEntries.map((entry) => (
            <article
              key={entry.id}
              style={{
                border: '2px solid #1f2430',
                borderRadius: 20,
                overflow: 'hidden',
                background: '#fffaf0',
                boxShadow: '0 10px 24px rgba(31, 36, 48, 0.1)',
              }}
            >
              <div style={{ padding: '16px 18px', borderBottom: '2px solid #1f2430', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{entry.title}</div>
                    <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>{entry.summary}</div>
                  </div>
                  <div
                    style={{
                      border: '2px solid #1f2430',
                      borderRadius: 999,
                      padding: '8px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      background: '#fff7d8',
                    }}
                  >
                    Brief: {entry.brief}
                  </div>
                </div>
              </div>
              <div>{entry.component}</div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
