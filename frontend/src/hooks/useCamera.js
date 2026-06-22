import { useRef, useState, useCallback, useEffect } from 'react';
import { detectMotion, isSharp, captureFrame } from '../utils/motionDetect';
import { scanFrame, addScannedItem } from '../services/api';

const SCAN_INTERVAL_MS = 2500;   // intervalo entre análises (quando estável)
const STABILIZE_MS = 800;        // espera após detectar movimento

export function useCamera({ listId, roomId, roomName, householdId, onItemFound }) {
  const videoRef = useRef(null);
  const prevCanvasRef = useRef(null);
  const intervalRef = useRef(null);
  const stabilizeTimerRef = useRef(null);

  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | scanning | moving | blurred | processing
  const [sessionRegistry, setSessionRegistry] = useState(new Set()); // fingerprints já vistos
  const [sessionItems, setSessionItems] = useState([]);              // itens desta sessão
  const [sceneAnchor, setSceneAnchor] = useState(null);

  const stopCamera = useCallback(() => {
    clearInterval(intervalRef.current);
    clearTimeout(stabilizeTimerRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    setStatus('idle');
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsActive(true);
      setStatus('scanning');
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      setStatus('idle');
    }
  }, []);

  // Loop principal de análise de frames
  useEffect(() => {
    if (!isActive) return;

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (status === 'processing') return;

      const { canvas, base64 } = captureFrame(videoRef.current);

      // 1. Detecção de movimento
      if (prevCanvasRef.current) {
        const moving = detectMotion(prevCanvasRef.current, canvas);
        if (moving) {
          setStatus('moving');
          clearTimeout(stabilizeTimerRef.current);
          stabilizeTimerRef.current = setTimeout(() => setStatus('scanning'), STABILIZE_MS);
          prevCanvasRef.current = canvas;
          return;
        }
      }
      prevCanvasRef.current = canvas;

      // 2. Detecção de desfoque
      if (!isSharp(canvas)) {
        setStatus('blurred');
        return;
      }

      // 3. Enviar para Claude Vision
      setStatus('processing');
      try {
        const result = await scanFrame({
          image_base64: base64,
          room_name: roomName,
          already_seen: Array.from(sessionRegistry),
          scene_anchor: sceneAnchor,
          household_id: householdId,
        });

        // Atualiza âncora de cena na primeira análise bem-sucedida
        if (!sceneAnchor && result.scene_description) {
          setSceneAnchor(result.scene_description);
        }

        // Processa itens novos
        for (const item of result.items || []) {
          if (sessionRegistry.has(item.fingerprint)) continue;

          // Adiciona à lista no backend
          const { item: listItem, product } = await addScannedItem({
            list_id: listId,
            room_id: roomId,
            household_id: householdId,
            product_data: item,
            qty: item.qty_visible || 1,
          });

          setSessionRegistry(prev => new Set([...prev, item.fingerprint]));
          setSessionItems(prev => [...prev, { ...item, listItemId: listItem.id, productId: product.id }]);
          onItemFound?.({ item, listItem, product });
        }
      } catch (err) {
        console.error('Erro no scan:', err);
      } finally {
        setStatus('scanning');
      }
    }, SCAN_INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  }, [isActive, status, sessionRegistry, sceneAnchor, listId, roomId, roomName, householdId, onItemFound]);

  // Limpa ao desmontar
  useEffect(() => () => stopCamera(), [stopCamera]);

  const resetSession = useCallback(() => {
    setSessionRegistry(new Set());
    setSessionItems([]);
    setSceneAnchor(null);
  }, []);

  return {
    videoRef,
    isActive,
    status,
    sessionItems,
    sessionRegistry,
    startCamera,
    stopCamera,
    resetSession,
  };
}
