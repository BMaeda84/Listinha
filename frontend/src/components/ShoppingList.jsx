import { useState } from 'react';

export default function ShoppingList({ list, api, onUpdate }) {
  const [checking, setChecking] = useState(null);

  if (!list?.items?.length) {
    return (
      <div style={styles.empty}>
        <span style={{ fontSize: 40 }}>🛒</span>
        <p>Nenhum item ainda.</p>
        <p style={{ fontSize: 13, color: '#9ca3af' }}>Use a câmera para começar a escanear!</p>
      </div>
    );
  }

  const byRoom = list.items.reduce((acc, item) => {
    const key = item.room_name || 'Sem cômodo';
    if (!acc[key]) acc[key] = { icon: item.room_icon || '📦', items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});

  const handleCheck = async (item) => {
    setChecking(item.id);
    try {
      await api.checkItem(item.id, !item.checked_at);
      onUpdate?.();
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(null);
    }
  };

  return (
    <div style={styles.container}>
      {Object.entries(byRoom).map(([roomName, { icon, items }]) => (
        <div key={roomName} style={styles.section}>
          <div style={styles.sectionHeader}>
            <span>{icon}</span>
            <span>{roomName}</span>
            <span style={styles.sectionCount}>
              {items.filter(i => i.checked_at).length}/{items.length}
            </span>
          </div>
          {items.map(item => (
            <div
              key={item.id}
              style={{ ...styles.item, opacity: item.checked_at ? 0.5 : 1 }}
              onClick={() => handleCheck(item)}
            >
              <div style={{
                ...styles.checkbox,
                background: item.checked_at ? '#16a34a' : 'transparent',
                borderColor: item.checked_at ? '#16a34a' : '#d1d5db',
              }}>
                {item.checked_at && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
              </div>
              <div style={styles.itemInfo}>
                <div style={{ ...styles.itemName, textDecoration: item.checked_at ? 'line-through' : 'none' }}>
                  {item.brand && <span style={styles.brand}>{item.brand} </span>}
                  {item.name}
                </div>
                {item.size_unit && <div style={styles.itemDetail}>{item.size_unit}</div>}
                {item.added_by_name && (
                  <div style={styles.addedBy}>por {item.added_by_name}</div>
                )}
              </div>
              <div style={styles.itemRight}>
                <div style={styles.qty}>{item.qty_needed}x</div>
                {item.category && (
                  <div style={{ ...styles.catTag, ...categoryColor(item.category) }}>
                    {item.category}
                  </div>
                )}
              </div>
              {checking === item.id && <div style={styles.spinner}>⏳</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function categoryColor(cat) {
  const map = {
    alimentação: { background: '#fef3c7', color: '#92400e' },
    limpeza:     { background: '#dbeafe', color: '#1e40af' },
    higiene:     { background: '#f3e8ff', color: '#6b21a8' },
    gatos:       { background: '#d1fae5', color: '#065f46' },
    outros:      { background: '#f3f4f6', color: '#374151' },
  };
  return map[cat] || map.outros;
}

const styles = {
  container: { paddingBottom: 100 },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  section: { marginBottom: 8 },
  sectionHeader: { display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px 6px', fontSize: 13, fontWeight: 700, color: '#374151', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' },
  sectionCount: { marginLeft: 'auto', fontSize: 12, color: '#9ca3af', fontWeight: 400 },
  item: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f3f4f6', background: '#fff', cursor: 'pointer', transition: 'opacity 0.2s', position: 'relative' },
  checkbox: { width: 22, height: 22, borderRadius: 6, border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 15, fontWeight: 500, color: '#111827' },
  brand: { color: '#6b7280', fontWeight: 400 },
  itemDetail: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  addedBy: { fontSize: 11, color: '#c4b5fd', marginTop: 1 },
  itemRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  qty: { fontSize: 14, fontWeight: 600, color: '#374151' },
  catTag: { fontSize: 10, fontWeight: 600, borderRadius: 4, padding: '2px 6px' },
  spinner: { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' },
};
