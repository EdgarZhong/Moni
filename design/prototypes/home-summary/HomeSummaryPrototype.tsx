import type { CSSProperties } from 'react';

type SummaryStat = {
  label: string;
  value: string;
};

type TransactionItem = {
  id: string;
  category: string;
  title: string;
  amount: string;
  note: string;
};

const summaryStats: SummaryStat[] = [
  { label: '本月支出', value: '¥3,428' },
  { label: '日均', value: '¥114' },
  { label: '预算剩余', value: '¥1,972' },
];

const transactions: TransactionItem[] = [
  { id: 't-1', category: '正餐', title: '工作日午饭', amount: '-¥28', note: '公司附近小馆' },
  { id: 't-2', category: '交通', title: '地铁通勤', amount: '-¥6', note: '二号线' },
  { id: 't-3', category: '购物', title: '洗衣液补货', amount: '-¥39', note: '便利超市' },
];

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at 18% 12%, rgba(255, 204, 112, 0.34), transparent 22%), radial-gradient(circle at 88% 10%, rgba(96, 199, 255, 0.28), transparent 18%), linear-gradient(180deg, #fcf6ea 0%, #f8f0df 100%)',
  padding: '24px 16px 40px',
  color: '#1f2430',
  fontFamily: '"Trebuchet MS", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
};

const phoneStyle: CSSProperties = {
  width: 'min(390px, 100%)',
  margin: '0 auto',
  border: '2px solid #1f2430',
  borderRadius: 28,
  background: '#fffdf8',
  boxShadow: '0 18px 48px rgba(31, 36, 48, 0.18)',
  overflow: 'hidden',
};

const sectionCardStyle: CSSProperties = {
  background: '#ffffff',
  border: '2px solid #1f2430',
  borderRadius: 18,
  boxShadow: '0 6px 0 rgba(31, 36, 48, 0.08)',
};

/**
 * 这是设计工作台的示例局部原型。
 * 它只展示首页主舞台的结构、层级与氛围，不接真实业务数据。
 */
export function HomeSummaryPrototype() {
  return (
    <div style={pageStyle}>
      <div style={{ width: 'min(860px, 100%)', margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.4 }}>Moni Design Preview</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#4b5563', marginTop: 6 }}>
            示例原型只验证设计评审机制、信息层级与轻量 Memphis 方向，不代表生产组件。
          </div>
        </div>

        <div style={phoneStyle}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              background: 'rgba(255, 253, 248, 0.92)',
              backdropFilter: 'blur(10px)',
              borderBottom: '2px solid #1f2430',
              padding: '18px 16px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>Moni</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingTop: 2 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: '#ff7a59', display: 'block' }} />
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: '#62c7ff', display: 'block' }} />
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        background: '#f6c445',
                        display: 'block',
                        transform: 'rotate(45deg)',
                      }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>首页主舞台示例</div>
              </div>
              <button
                type="button"
                style={{
                  border: '2px solid #1f2430',
                  background: '#fff',
                  borderRadius: 999,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1f2430',
                }}
              >
                日常开销
              </button>
            </div>
          </div>

          <div style={{ padding: 16, display: 'grid', gap: 14 }}>
            <section
              style={{
                ...sectionCardStyle,
                padding: 16,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,245,226,1) 100%)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>本月预算状态</div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>¥1,972</div>
                </div>
                <div
                  style={{
                    border: '2px solid #1f2430',
                    borderRadius: 999,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    background: '#ebfff5',
                    color: '#14532d',
                  }}
                >
                  健康
                </div>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: '#ffe6d7', overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: '64%', height: '100%', background: '#62c7ff' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {summaryStats.map((item) => (
                  <div key={item.label} style={{ border: '2px solid #1f2430', borderRadius: 14, padding: '10px 10px 8px', background: '#fff' }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section
              style={{
                ...sectionCardStyle,
                padding: 14,
                background: '#fff7d8',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: 14,
                  top: 10,
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: '#62c7ff',
                  opacity: 0.22,
                }}
              />
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>情景提示</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
                最近 7 天午餐支出较稳定，今天如果看到“咖啡 + 小食”被归成“正餐”，可以顺手拖到“零食”。
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {['全部', '餐饮', '交通'].map((item, index) => (
                <div
                  key={item}
                  style={{
                    border: '2px solid #1f2430',
                    borderRadius: 999,
                    padding: '10px 8px',
                    textAlign: 'center',
                    background: index === 0 ? '#1f2430' : '#fff',
                    color: index === 0 ? '#fff' : '#1f2430',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {item}
                </div>
              ))}
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#374151' }}>4 月 24 日 周五</div>
              {transactions.map((item) => (
                <article
                  key={item.id}
                  style={{
                    ...sectionCardStyle,
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'inline-flex', border: '2px solid #1f2430', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                      {item.category}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{item.note}</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#d14f38', whiteSpace: 'nowrap' }}>{item.amount}</div>
                </article>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
