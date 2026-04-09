import { useState, useCallback, useEffect } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import MoniHome from '@ui/pages/MoniHome';
import MoniEntry from '@ui/pages/MoniEntry';
import MoniSettings from '@ui/pages/MoniSettings';

type Page = 'home' | 'entry' | 'settings';

function App() {
  const [activePage, setActivePage] = useState<Page>('home');
  const [autoLearningNotice, setAutoLearningNotice] = useState<{
    visible: boolean;
    message: string;
  }>({
    visible: false,
    message: '',
  });

  const handleNavigate = useCallback((page: Page) => {
    setActivePage(page);
  }, []);

  useEffect(() => {
    const unsubscribe = appFacade.subscribeAutoLearningEvents((event) => {
      if (event.phase !== 'triggered') {
        return;
      }

      setAutoLearningNotice({
        visible: true,
        message: `账本「${event.ledgerName}」已触发自动学习，AI 正在后台更新记忆。`,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <>
      {activePage === 'entry' ? <MoniEntry onNavigate={handleNavigate} /> : null}
      {activePage === 'settings' ? <MoniSettings onNavigate={handleNavigate} /> : null}
      {activePage === 'home' ? <MoniHome onNavigate={handleNavigate} /> : null}
      {autoLearningNotice.visible ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.32)',
            padding: 12,
          }}
          onClick={() => setAutoLearningNotice((value) => ({ ...value, visible: false }))}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(320px, calc(100% - 16px))',
              background: '#ffffff',
              border: '2px solid #222222',
              borderRadius: 12,
              boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
              padding: '14px 12px 12px',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 8 }}>
              自动学习已触发
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#303030', marginBottom: 12, wordBreak: 'break-word' }}>
              {autoLearningNotice.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setAutoLearningNotice((value) => ({ ...value, visible: false }))}
                style={{
                  border: '2px solid #222222',
                  borderRadius: 10,
                  background: '#111111',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 12,
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default App;
