import { useState } from 'react';
import Home from './pages/Home';
import ListDetail from './pages/ListDetail';

export default function App() {
  const [page, setPage] = useState({ name: 'home' });

  function openList(listId, household) {
    setPage({ name: 'list', listId, household });
  }

  function goHome() {
    setPage({ name: 'home' });
  }

  if (page.name === 'list') {
    return (
      <ListDetail
        listId={page.listId}
        household={page.household}
        onBack={goHome}
      />
    );
  }

  return <Home onOpenList={openList} />;
}
