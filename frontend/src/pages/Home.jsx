import { useState, useEffect, useCallback, useMemo } from 'react';
import { createApi } from '../services/api';

export default function Home({ auth, onOpenList }) {
  const api = useMemo(() => createApi(auth.token), [auth.token]);

  const [household, setHousehold] = useState(auth.household);
  const [lists,     setLists]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const bootstrap = useCallback(async () => {
    try {
      const [hh, ls] = await Promise.all([api.getHousehold(), api.getLists()]);
      setHousehold(hh);
      setLists(ls);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { bootstrap(); }, [bootstrap]);

  async function handleNewList() {
    if (creating) return;
    setCreating(true);
    try {
      const name = `Lista ${new Date().toLocaleDateString('pt-BR')}`;
      const list = await api.createList(name);
      setLists(prev => [list, ...prev]);
      onOpenList(list.id);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={{ fontSize: 40 }}>🛒</div>
        <p style={{ color: '#9ca3af', marginTop: 12 }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div>
            <div style={styles.logo}>🛒 Listinha</div>
            <div style={styles.householdName}>{household?.name || auth.household?.name}</div>
          </div>
          <div style={styles.headerActions}>
            <button style={styles.inviteBtn} onClick={() => setShowInvite(v => !v)} title="Código de convite">
              👥
            </button>
            <button style={styles.logoutBtn} onClick={auth.logout} title="Sair">
              ↩
            </button>
          </div>
        </div>

        {showInvite && household?.invite_code && (
          <div style={styles.inviteBox}>
            <span style={styles.inviteLabel}>Código de convite da casa</span>
            <span style={styles.inviteCode}>{household.invite_code}</span>
            <span style={styles.inviteHint}>Compartilhe com sua família para entrar na mesma lista</span>
          </div>
        )}
      </header>

      <div style={styles.content}>
        <button style={styles.btnNew} onClick={handleNewList} disabled={creating}>
          {creating ? '...' : '+ Nova lista de compras'}
        </button>

        {/* Membros da casa */}
        {household?.members?.length > 1 && (
          <div style={styles.membersRow}>
            {household.members.map(m => (
              <div key={m.id} style={styles.memberChip} title={m.email}>
                {m.name.split(' ')[0]}
              </div>
            ))}
          </div>
        )}

        {lists.length === 0 ? (
          <div style={styles.empty}>
            <span style={{ fontSize: 48 }}>📋</span>
            <p>Nenhuma lista ainda.</p>
            <p style={styles.hint}>Crie sua primeira lista e use a câmera para escanear os produtos!</p>
          </div>
        ) : (
          <div>
            <div style={styles.groupLabel}>Suas listas</div>
            {lists.map(list => (
              <div key={list.id} style={styles.listCard} onClick={() => onOpenList(list.id)}>
                <div>
                  <div style={styles.listName}>{list.name}</div>
                  <div style={styles.listMeta}>
                    {list.checked_items}/{list.total_items} itens comprados
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ ...styles.statusDot, background: list.status === 'done' ? '#16a34a' : '#f59e0b' }} />
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
  center: { minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  header: { background: '#16a34a', padding: '20px 20px 16px', color: '#fff' },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' },
  householdName: { fontSize: 13, opacity: 0.8, marginTop: 2 },
  headerActions: { display: 'flex', gap: 8, alignItems: 'center' },
  inviteBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 16, cursor: 'pointer', color: '#fff' },
  logoutBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 16, cursor: 'pointer', color: '#fff' },
  inviteBox: {
    marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 10,
    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
  },
  inviteLabel: { fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '.06em' },
  inviteCode: { fontSize: 24, fontWeight: 900, letterSpacing: 4, fontFamily: 'monospace' },
  inviteHint: { fontSize: 11, opacity: 0.7 },
  content: { padding: 16 },
  btnNew: {
    width: '100%', background: '#16a34a', color: '#fff',
    border: 'none', borderRadius: 12, padding: 16,
    fontSize: 16, fontWeight: 700, cursor: 'pointer',
    marginBottom: 16, boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
  },
  membersRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  memberChip: {
    background: '#dcfce7', color: '#15803d',
    borderRadius: 20, padding: '4px 12px',
    fontSize: 13, fontWeight: 600,
  },
  empty: { textAlign: 'center', padding: '40px 20px', color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  hint: { fontSize: 13, maxWidth: 260, lineHeight: 1.5 },
  groupLabel: { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 },
  listCard: {
    background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 10,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  listName: { fontSize: 15, fontWeight: 600, color: '#111827' },
  listMeta: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  chevron: { fontSize: 20, color: '#d1d5db' },
};
