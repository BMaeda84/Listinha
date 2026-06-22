const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Households
export const createHousehold = (name) =>
  request('/api/households', { method: 'POST', body: JSON.stringify({ name }) });

export const getHousehold = (id) =>
  request(`/api/households/${id}`);

// Listas
export const createList = (household_id, name) =>
  request('/api/lists', { method: 'POST', body: JSON.stringify({ household_id, name }) });

export const getLists = (householdId) =>
  request(`/api/lists/household/${householdId}`);

export const getList = (id) =>
  request(`/api/lists/${id}`);

export const checkItem = (itemId, checked) =>
  request(`/api/lists/items/${itemId}/check`, {
    method: 'PATCH',
    body: JSON.stringify({ checked }),
  });

export const completeList = (listId) =>
  request(`/api/lists/${listId}/complete`, { method: 'PATCH' });

// Scan
export const scanFrame = (payload) =>
  request('/api/scan/frame', { method: 'POST', body: JSON.stringify(payload) });

export const scanBarcode = (barcode, household_id) =>
  request('/api/scan/barcode', { method: 'POST', body: JSON.stringify({ barcode, household_id }) });

export const addScannedItem = (payload) =>
  request('/api/scan/add-item', { method: 'POST', body: JSON.stringify(payload) });
