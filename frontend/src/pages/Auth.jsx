import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '/api';

export default function Auth({ onAuth }) {
  // 'login' | 'register' | 'join'
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', houseName: '', invite_code: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint =
        mode === 'login'    ? `${API}/auth/login`    :
        mode === 'register' ? `${API}/auth/register` :
                              `${API}/auth/join`;

      const body =
        mode === 'login'    ? { email: form.email, password: form.password } :
        mode === 'register' ? { name: form.name, email: form.email, password: form.password, houseName: form.houseName } :
                              { name: form.name, email: form.email, password: form.password, invite_code: form.invite_code };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
      onAuth(data.token, data.user, data.household);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/icon.svg" alt="Listinha" width="56" height="56" />
          <h1>Listinha</h1>
          <p>Lista de compras familiar</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login'    ? 'active' : ''} onClick={() => { setMode('login');    setError(''); }}>Entrar</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Criar conta</button>
          <button className={mode === 'join'     ? 'active' : ''} onClick={() => { setMode('join');     setError(''); }}>Usar convite</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {(mode === 'register' || mode === 'join') && (
            <label>
              Seu nome
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="Como te chamam?"
                required
                autoComplete="name"
              />
            </label>
          )}

          <label>
            E-mail
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder={mode === 'login' ? 'Sua senha' : 'Mínimo 6 caracteres'}
              required
              minLength={mode === 'login' ? undefined : 6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (
            <label>
              Nome da casa <span className="optional">(opcional)</span>
              <input
                type="text"
                value={form.houseName}
                onChange={set('houseName')}
                placeholder="ex: Casa da família Silva"
                maxLength={100}
              />
            </label>
          )}

          {mode === 'join' && (
            <label>
              Código de convite
              <input
                type="text"
                value={form.invite_code}
                onChange={(e) => setForm((f) => ({ ...f, invite_code: e.target.value.toUpperCase() }))}
                placeholder="ex: AB3C7XYZ"
                maxLength={8}
                required
                className="code-input"
                autoComplete="off"
              />
            </label>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar minha conta' : 'Entrar na casa'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="auth-hint">
            Ao criar sua conta, você cria a casa. Compartilhe o código de convite com sua família depois.
          </p>
        )}
        {mode === 'join' && (
          <p className="auth-hint">
            Peça o código de 8 letras para quem criou a casa.
          </p>
        )}
      </div>
    </div>
  );
}
