import { useState, useEffect, useCallback } from 'react';
import { createHousehold, getHousehold, getLists, createList } from '../services/api';

const HOUSEHOLD_KEY = 'listinha_household_id';

export default function Home({ onOpenList }) {
  const [household, setHousehold] = useState(null);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const bootstrap = useCallback(async () => {
    try {
      let id = localStorage.getItem(HOUSEHOLD_KEY);
      if (!id) {
        const hh = await createHousehold('Minha Casa');
        id = hh.id;
        localStorage.setItem(HOUSEHOLD_KEY, id);
        setHousehold(hh);
        setLists([]);
      } else {
        const [hh, ls] = await Promise.all([getHousehold(id), getLists(id)]);
        setHousehold(hh);
        setLists(ls);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // loading inicia como true; bootstrap só precisa setá-lo para false
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { bootstrap(); }, [bootstrap]);

  async function handleNewList() {
    if (!household || creating) return;
    setCreating(true);
    try {
      const now = new Date();
      const name = `Lista ${now.toLocaleDateString('pt-BR')}`;
      const list = await createList(household.id, name);
      setLists(prev => [list, ...prev]);
      onOpenList(list.id, household);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner}>🛒</div>
        <p style={{ color: '#9ca3af', marginTop: 12 }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logo}>🛒 Listinha</div>
        <div style={styles.householdName}>{household?.name}</div>
      </header>

      <div style={styles.content}>
        <button style={styles.btnNew} onClick={handleNewList} disabled={creating}>
          {creating ? '...' : '+ Nova lista de compras'}
        </button>

        {lists.length === 0 ? (
          <div style={styles.empty}>
            <span style={{ fontSize: 48 }}>📋</span>
            <p>Nenhuma lista ainda.</p>
            <p style={styles.hint}>Crie sua primeira lista e use a câmera para escanear os produtos!</p>
          </div>
        ) : (
          <div style={styles.listGroup}>
            <div style={styles.groupLabel}>Suas listas</div>
            {lists.map(list => (
              <div
                key={list.id}
                style={styles.listCard}
                onClick={() => onOpenList(list.id, household)}
              >
                <div style={styles.listCardLeft}>
                  <div style={styles.listName}>{list.name}</div>
                  <div style={styles.listMeta}>
                    {list.checked_items}/{list.total_items} itens comprados
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    ...styles.statusDot,
                    background: list.status === 'done' ? '#16a34a' : '#f59e0b',
                  }} />
                  <span style={styles.chevron}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100dvh', background: '#f9fafb' },
  center: {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  spinner: { fontSize: 40, animation: 'pulse 1.5s infinite' },
  header: {
    background: '#16a34a',
    padding: '20px 20px 16px',
    color: '#fff',
  },
  logo: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' },
  householdName: { fontSize: 13, opacity: 0.8, marginTop: 2 },
  content: { padding: 16 },
  btnNew: {
    width: '100%',
    background: '#16a34a', color: '#fff',
    border: 'none', borderRadius: 12,
    padding: '16px', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', marginBottom: 24,
    boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
  },
  empty: {
    textAlign: 'center', padding: '40px 20px',
    color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  hint: { fontSize: 13, maxWidth: 260, lineHeight: 1.5 },
  listGroup: {},
  groupLabel: { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 },
  listCard: {
    background: '#fff', borderRadius: 12,
    padding: '14px 16px', marginBottom: 10,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  listCardLeft: {},
  listName: { fontSize: 15, fontWeight: 600, color: '#111827' },
  listMeta: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  chevron: { fontSize: 20, color: '#d1d5db' },
};
