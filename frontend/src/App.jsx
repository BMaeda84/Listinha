import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import Auth from './pages/Auth';
import Home from './pages/Home';
import ListDetail from './pages/ListDetail';

export default function App() {
  const auth = useAuth();
  const [page, setPage] = useState({ name: 'home' });

  if (!auth.isLoggedIn) {
    return <Auth onAuth={(token, user, household) => auth.save(token, user, household)} />;
  }

  if (page.name === 'list') {
    return (
      <ListDetail
        listId={page.listId}
        household={auth.household}
        auth={auth}
        onBack={() => setPage({ name: 'home' })}
      />
    );
  }

  return (
    <Home
      auth={auth}
      onOpenList={(listId) => setPage({ name: 'list', listId })}
    />
  );
}
