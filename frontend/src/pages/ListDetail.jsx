import { useState, useEffect, useCallback, useMemo } from 'react';
import { createApi } from '../services/api';
import ShoppingList from '../components/ShoppingList';
import CameraScanner from '../components/CameraScanner';

export default function ListDetail({ listId, household, auth, onBack }) {
  const api = useMemo(() => createApi(auth.token), [auth.token]);

  const [list,           setList]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [scannerOpen,    setScannerOpen]    = useState(false);
  const [scannerRoom,    setScannerRoom]    = useState(null);
  const [completing,     setCompleting]     = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await api.getList(listId);
      setList(data);
    } catch (err) {
      console.error(err);
    }
  }, [api, listId]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  // Polling a cada 10s para sincronizar com outros membros da casa
  useEffect(() => {
    if (loading) return;
    const id = setInterval(reload, 10_000);
    return () => clearInterval(id);
  }, [loading, reload]);

  function openScanner(room) {
    setScannerRoom(room);
    setScannerOpen(true);
    setRoomPickerOpen(false);
  }

  async function handleComplete() {
    if (!window.confirm('Marcar esta lista como concluída?')) return;
    setCompleting(true);
    try {
      await api.completeList(listId);
      await reload();
    } catch (err) {
      console.error(err);
    } finally {
      setCompleting(false);
    }
  }

  const totalItems   = list?.items?.length || 0;
  const checkedItems = list?.items?.filter(i => i.checked_at).length || 0;
  const progress     = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;

  if (loading) {
    return (
      <div style={styles.center}>
        <p style={{ color: '#9ca3af' }}>Carregando lista...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>‹</button>
        <div style={styles.headerCenter}>
          <div style={styles.listName}>{list?.name}</div>
          {totalItems > 0 && (
            <div style={styles.progress}>{checkedItems}/{totalItems} itens</div>
          )}
        </div>
        {list?.status === 'open' && totalItems > 0 && (
          <button style={styles.doneBtn} onClick={handleComplete} disabled={completing}>
            {completing ? '...' : '✓ Finalizar'}
          </button>
        )}
        {list?.status === 'done' && (
          <span style={styles.doneBadge}>✓ Concluída</span>
        )}
      </header>

      {totalItems > 0 && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      )}

      <ShoppingList list={list} api={api} onUpdate={reload} />

      {list?.status === 'open' && (
        <div style={styles.fabArea}>
          <button style={styles.fab} onClick={() => setRoomPickerOpen(true)}>
            📷 Escanear
          </button>
        </div>
      )}

      {roomPickerOpen && (
        <div style={styles.sheet} onClick={() => setRoomPickerOpen(false)}>
          <div style={styles.sheetCard} onClick={e => e.stopPropagation()}>
            <div style={styles.sheetTitle}>Qual cômodo você vai escanear?</div>
            <div style={styles.roomGrid}>
              {household?.rooms?.map(room => (
                <button key={room.id} style={styles.roomBtn} onClick={() => openScanner(room)}>
                  <span style={{ fontSize: 24 }}>{room.icon}</span>
                  <span style={styles.roomBtnLabel}>{room.name}</span>
                </button>
              ))}
            </div>
            <button style={styles.cancelBtn} onClick={() => setRoomPickerOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {scannerOpen && (
        <CameraScanner
          listId={listId}
          roomId={scannerRoom?.id}
          roomName={scannerRoom?.name}
          api={api}
          onItemFound={reload}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100dvh', background: '#f9fafb', paddingBottom: 80 },
  center: { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  header: {
    background: '#16a34a', color: '#fff', padding: '14px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
    position: 'sticky', top: 0, zIndex: 10,
  },
  backBtn: { background: 'transparent', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
  headerCenter: { flex: 1 },
  listName: { fontSize: 16, fontWeight: 700 },
  progress: { fontSize: 12, opacity: 0.8, marginTop: 1 },
  doneBtn: { background: '#fff', color: '#16a34a', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  doneBadge: { background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600 },
  progressBar: { height: 4, background: '#dcfce7' },
  progressFill: { height: '100%', background: '#fff', transition: 'width 0.4s' },
  fabArea: { position: 'fixed', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' },
  fab: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 50, padding: '14px 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer', pointerEvents: 'all', boxShadow: '0 4px 16px rgba(22,163,74,0.4)' },
  sheet: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 50 },
  sheetCard: { background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%' },
  sheetTitle: { fontSize: 16, fontWeight: 700, color: '#111827', textAlign: 'center', marginBottom: 16 },
  roomGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 },
  roomBtn: { background: '#f9fafb', border: '2px solid #e5e7eb', borderRadius: 12, padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' },
  roomBtnLabel: { fontSize: 12, fontWeight: 600, color: '#374151' },
  cancelBtn: { width: '100%', background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 15, cursor: 'pointer', padding: 10 },
};
