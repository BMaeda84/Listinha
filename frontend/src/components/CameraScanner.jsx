import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useCamera } from '../hooks/useCamera';

const STATUS_LABELS = {
  idle:       null,
  scanning:   null,
  moving:     '📷 Aguardando estabilizar...',
  blurred:    '🔍 Desfocando — ajuste a câmera',
  processing: '🤖 Analisando...',
};

const STATUS_COLORS = {
  idle:       'transparent',
  scanning:   '#16a34a',
  moving:     '#f59e0b',
  blurred:    '#ef4444',
  processing: '#6366f1',
};

export default function CameraScanner({ listId, roomId, roomName, api, onItemFound, onClose }) {
  const [toasts, setToasts] = useState([]);
  const zxingRef = useRef(null);

  const showToast = (msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const handleItemFound = ({ item }) => {
    showToast(`✅ ${item.brand ? item.brand + ' ' : ''}${item.name}`, 'success');
    onItemFound?.();
  };

  const { videoRef, isActive, status, sessionItems, startCamera, stopCamera, resetSession } =
    useCamera({ listId, roomId, roomName, api, onItemFound: handleItemFound });

  // ZXing barcode — corre em paralelo com Vision
  useEffect(() => {
    if (!isActive) return;

    const reader = new BrowserMultiFormatReader();
    zxingRef.current = reader;

    const videoEl = videoRef.current;
    if (!videoEl) return;

    let lastBarcode = null;
    let lastBarcodeTime = 0;

    const controls = reader.decodeFromVideoElement(videoEl, async (result) => {
      if (!result) return;
      const code = result.getText();
      const now = Date.now();

      if (code === lastBarcode && now - lastBarcodeTime < 5000) return;
      lastBarcode = code;
      lastBarcodeTime = now;

      try {
        const { found, product } = await api.scanBarcode(code);
        if (found) {
          await api.addScannedItem({ list_id: listId, room_id: roomId, product_data: product, qty: 1 });
          showToast(`🏷️ ${product.brand ? product.brand + ' ' : ''}${product.name}`, 'barcode');
          onItemFound?.();
        } else {
          showToast(`Código ${code} não encontrado`, 'warn');
        }
      } catch (e) {
        console.error('Erro barcode:', e);
      }
    }).catch(() => {});

    return () => controls?.stop?.();
  }, [isActive, listId, roomId, api, videoRef, onItemFound]);

  return (
    <div style={styles.container}>
      <div style={{ ...styles.statusBar, background: STATUS_COLORS[status] }} />

      <div style={styles.videoWrapper}>
        <video ref={videoRef} autoPlay playsInline muted style={styles.video} />

        {isActive && (
          <div style={styles.overlay}>
            <div style={styles.corner('top', 'left')} />
            <div style={styles.corner('top', 'right')} />
            <div style={styles.corner('bottom', 'left')} />
            <div style={styles.corner('bottom', 'right')} />
          </div>
        )}

        {STATUS_LABELS[status] && (
          <div style={styles.statusLabel}>{STATUS_LABELS[status]}</div>
        )}

        <div style={styles.toastStack}>
          {toasts.map(t => (
            <div key={t.id} style={{ ...styles.toast, ...toastTypeStyle(t.type) }}>
              {t.msg}
            </div>
          ))}
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.roomChip}>📍 {roomName || 'Sem cômodo'}</div>

        {!isActive ? (
          <button style={styles.btnPrimary} onClick={startCamera}>📷 Iniciar câmera</button>
        ) : (
          <div style={styles.activeControls}>
            <button style={styles.btnSecondary} onClick={resetSession}>🔄 Nova sessão</button>
            <button style={styles.btnDanger} onClick={stopCamera}>⏹ Parar</button>
          </div>
        )}

        <button style={styles.btnClose} onClick={onClose}>Fechar</button>
      </div>

      {sessionItems.length > 0 && (
        <div style={styles.sessionCount}>
          {sessionItems.length} {sessionItems.length === 1 ? 'item identificado' : 'itens identificados'} nesta sessão
        </div>
      )}
    </div>
  );
}

function toastTypeStyle(type) {
  const map = {
    success: { background: '#16a34a' },
    barcode: { background: '#6366f1' },
    warn:    { background: '#f59e0b' },
    info:    { background: '#374151' },
  };
  return map[type] || map.info;
}

const styles = {
  container: { position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', zIndex: 100 },
  statusBar: { height: 4, transition: 'background 0.3s' },
  videoWrapper: { flex: 1, position: 'relative', overflow: 'hidden' },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  overlay: { position: 'absolute', inset: '15%', pointerEvents: 'none' },
  corner: (v, h) => ({
    position: 'absolute', [v]: 0, [h]: 0,
    width: 28, height: 28, borderColor: '#fff', borderStyle: 'solid',
    borderTopWidth: v === 'top' ? 3 : 0, borderBottomWidth: v === 'bottom' ? 3 : 0,
    borderLeftWidth: h === 'left' ? 3 : 0, borderRightWidth: h === 'right' ? 3 : 0,
  }),
  statusLabel: { position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 500, background: 'rgba(0,0,0,0.5)', padding: '6px 0' },
  toastStack: { position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' },
  toast: { color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 500 },
  controls: { background: '#111', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' },
  roomChip: { background: '#1f2937', color: '#d1fae5', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500 },
  activeControls: { display: 'flex', gap: 10 },
  btnPrimary: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' },
  btnSecondary: { background: '#374151', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, cursor: 'pointer' },
  btnDanger: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, cursor: 'pointer' },
  btnClose: { background: 'transparent', color: '#9ca3af', border: 'none', fontSize: 13, cursor: 'pointer', padding: '4px 0' },
  sessionCount: { background: '#1a1a1a', color: '#6b7280', textAlign: 'center', fontSize: 12, padding: 6 },
};
