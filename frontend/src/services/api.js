const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, token, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Retorna um objeto com todas as funções de API vinculadas ao token do usuário
export function createApi(token) {
  const r = (path, opts) => request(path, token, opts);
  const post = (path, body) => r(path, { method: 'POST', body: JSON.stringify(body) });
  const patch = (path, body) => r(path, { method: 'PATCH', body: JSON.stringify(body) });

  return {
    // Household do usuário logado (rooms + members)
    getHousehold: () => r('/households/me'),

    // Listas
    createList:  (name) => post('/lists', { name }),
    getLists:    () => r('/lists'),
    getList:     (id) => r(`/lists/${id}`),
    checkItem:   (itemId, checked) => patch(`/lists/items/${itemId}/check`, { checked }),
    completeList: (listId) => patch(`/lists/${listId}/complete`, {}),

    // Scan
    scanFrame:      (payload) => post('/scan/frame', payload),
    scanBarcode:    (barcode) => post('/scan/barcode', { barcode }),
    addScannedItem: (payload) => post('/scan/add-item', payload),
  };
}
