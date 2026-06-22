import { useRef, useState, useCallback, useEffect } from 'react';
import { detectMotion, isSharp, captureFrame } from '../utils/motionDetect';

const SCAN_INTERVAL_MS = 2500;
const STABILIZE_MS = 800;

export function useCamera({ listId, roomId, roomName, api, onItemFound }) {
  const videoRef = useRef(null);
  const prevCanvasRef = useRef(null);
  const intervalRef = useRef(null);
  const stabilizeTimerRef = useRef(null);

  const statusRef = useRef('idle');
  const isProcessingRef = useRef(false);

  // Map<fingerprint, displayName> — não é state para não causar re-renders no loop
  const registryRef = useRef(new Map());
  const sceneAnchorRef = useRef(null);

  const [isActive,     setIsActive]     = useState(false);
  const [status,       setStatus]       = useState('idle');
  const [sessionItems, setSessionItems] = useState([]);

  function updateStatus(s) {
    statusRef.current = s;
    setStatus(s);
  }

  const stopCamera = useCallback(() => {
    clearInterval(intervalRef.current);
    clearTimeout(stabilizeTimerRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    isProcessingRef.current = false;
    setIsActive(false);
    updateStatus('idle');
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsActive(true);
      updateStatus('scanning');
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      updateStatus('idle');
    }
  }, []);

  // Loop principal
  useEffect(() => {
    if (!isActive) return;

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (isProcessingRef.current || statusRef.current === 'moving') return;

      const { canvas, base64 } = captureFrame(videoRef.current);

      // 1. Detecção de movimento
      if (prevCanvasRef.current) {
        const moving = detectMotion(prevCanvasRef.current, canvas);
        if (moving) {
          updateStatus('moving');
          clearTimeout(stabilizeTimerRef.current);
          stabilizeTimerRef.current = setTimeout(() => updateStatus('scanning'), STABILIZE_MS);
          prevCanvasRef.current = canvas;
          return;
        }
      }
      prevCanvasRef.current = canvas;

      // 2. Detecção de desfoque
      if (!isSharp(canvas)) {
        updateStatus('blurred');
        return;
      }

      // 3. Enviar para Vision
      isProcessingRef.current = true;
      updateStatus('processing');

      try {
        const alreadySeen = Array.from(registryRef.current.values());

        const result = await api.scanFrame({
          image_base64: base64,
          room_name: roomName,
          already_seen: alreadySeen,
          scene_anchor: sceneAnchorRef.current,
        });

        if (!sceneAnchorRef.current && result.scene_description) {
          sceneAnchorRef.current = result.scene_description;
        }

        for (const item of result.items || []) {
          if (registryRef.current.has(item.fingerprint)) continue;

          const { item: listItem, product } = await api.addScannedItem({
            list_id: listId,
            room_id: roomId,
            product_data: item,
            qty: item.qty_visible || 1,
          });

          registryRef.current.set(item.fingerprint, item.display_name || item.name);

          setSessionItems(prev => [
            ...prev,
            { ...item, listItemId: listItem.id, productId: product.id },
          ]);
          onItemFound?.({ item, listItem, product });
        }
      } catch (err) {
        console.error('Erro no scan:', err);
      } finally {
        isProcessingRef.current = false;
        updateStatus('scanning');
      }
    }, SCAN_INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, listId, roomId, roomName]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const resetSession = useCallback(() => {
    registryRef.current.clear();
    sceneAnchorRef.current = null;
    setSessionItems([]);
  }, []);

  return { videoRef, isActive, status, sessionItems, sessionCount: sessionItems.length, startCamera, stopCamera, resetSession };
}
