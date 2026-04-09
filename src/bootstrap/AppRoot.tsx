import { useState, useCallback } from 'react';
import MoniHome from '@ui/pages/MoniHome';
import MoniEntry from '@ui/pages/MoniEntry';

type Page = 'home' | 'entry';

function App() {
  const [activePage, setActivePage] = useState<Page>('home');

  const handleNavigate = useCallback((page: Page) => {
    setActivePage(page);
  }, []);

  if (activePage === 'entry') {
    return <MoniEntry onNavigate={handleNavigate} />;
  }

  return <MoniHome onNavigate={handleNavigate} />;
}

export default App;
