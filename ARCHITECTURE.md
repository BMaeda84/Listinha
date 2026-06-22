# Listinha — Arquitetura, Escalabilidade e Fases

## Visão Geral

Listinha é um PWA mobile-first de lista de compras com escaneamento contínuo por câmera e IA. O usuário aponta o celular para a prateleira e o app identifica produtos automaticamente, organiza por cômodo e aprende padrões de reposição ao longo do tempo.

---

## Arquitetura Atual (MVP)

```
┌─────────────────────────────────────────────────┐
│                  Cliente (PWA)                  │
│  React 19 + Vite 8 · mobile-first · max 480px  │
│                                                 │
│  useCamera ──► motion detect ──► blur detect   │
│      │               │                          │
│      │          ZXing (barcode)                 │
│      │               │                          │
│      └───────────────┴──► POST /api/scan/frame  │
└─────────────────────────────────────────────────┘
                        │
                   HTTPS (Railway)
                        │
┌─────────────────────────────────────────────────┐
│              Backend (Node.js / Express)         │
│                                                 │
│  /api/scan/frame ──► OpenAI gpt-4.1-nano       │
│  /api/scan/barcode ──► products table           │
│  /api/scan/add-item ──► IDOR check ──► insert  │
│  /api/lists · /api/rooms · /api/households      │
│                                                 │
│  Rate limit: 120 req/min geral · 30 em /frame  │
└─────────────────────────────────────────────────┘
                        │
                   Private network
                        │
┌─────────────────────────────────────────────────┐
│           PostgreSQL 18 (Railway managed)        │
│                                                 │
│  households · rooms · products · shopping_lists │
│  list_items · scan_sessions                     │
│  purchase_history · restock_patterns            │
└─────────────────────────────────────────────────┘
```

### Fluxo de escaneamento

```
frame JPEG (base64)
        │
        ▼
  motion detected?  ──── não ──► descarta
        │ sim
        ▼
  frame nítido?     ──── não ──► descarta
        │ sim
        ▼
  ZXing barcode?    ──── sim ──► lookup products ──► adiciona
        │ não
        ▼
  POST /api/scan/frame
  { image_base64, already_seen[], scene_anchor }
        │
        ▼
  gpt-4.1-nano (detail: low)
        │
        ▼
  items[] com fingerprint
        │
        ▼
  registryRef (Map<fingerprint, displayName>)
  já visto? ──► descarta
        │ não
        ▼
  adiciona à lista + atualiza registry
```

---

## Decisões de Design

| Decisão | Escolha | Motivo |
|---|---|---|
| Modelo de IA | gpt-4.1-nano | Mais barato com visão ($0.10/1M tokens), 1M de contexto |
| Deduplicação | Map em useRef por sessão | Evita re-renders; persiste enquanto câmera ativa |
| Âncora de cena | `scene_anchor` passado ao AI | Contexto do local scaneado evita reidenticar mesmos produtos |
| Ícones PWA | SVG `sizes: any` | Sem dependência de canvas/sharp; Chrome/Android aceitam |
| Auth | household_id por sessão | MVP sem login; multi-tenant por household UUID |
| Endpoint privado DB | `${{Postgres.DATABASE_URL}}` | Railway private network — sem custo de egress |
| Rate limit | express-rate-limit | Proteção contra abuso da API OpenAI |
| Segurança prompts | `sanitizeForPrompt()` | Remove `<>[]{}\\` antes de interpolar input do usuário |

---

## Escalabilidade

### Gargalos atuais e soluções por nível

#### Nível 1 — Até ~500 usuários/mês (MVP)
Estado atual. Um serviço backend, um banco, sem cache.

- **OpenAI**: custo estimado ~$2–5/mês com uso casual
- **Railway**: plano Hobby ($5/mês por serviço) suporta bem
- **Banco**: single instance, queries simples, sem problema

#### Nível 2 — 500 a 5.000 usuários/mês

```
┌────────────────────────────────────────────┐
│              Railway (ou Fly.io)            │
│                                            │
│  Frontend CDN  ◄──── Cloudflare Pages      │
│  Backend × 2  ◄──── Railway replicas      │
│  Redis cache  ◄──── Railway Redis          │
│  Postgres     ◄──── connection pool (pg)   │
└────────────────────────────────────────────┘
```

Ações necessárias:
- **Cache de produtos**: Redis com TTL 24h para barcodes já consultados
- **Connection pool**: `pg` pool já presente; ajustar `max: 10`
- **Frontend no CDN**: mover para Cloudflare Pages (build estático)
- **Replica do backend**: Railway permite múltiplas instâncias

Custo estimado: ~$30–60/mês

#### Nível 3 — 5.000 a 50.000 usuários/mês

```
┌──────────────────────────────────────────────────┐
│                 Infraestrutura                    │
│                                                   │
│  Cloudflare Pages (frontend estático)             │
│  Cloudflare AI Gateway (cache de chamadas IA)     │
│         │                                         │
│  Load Balancer                                    │
│    ├── Backend pod A                              │
│    ├── Backend pod B                              │
│    └── Backend pod C                              │
│         │                                         │
│  PostgreSQL (primary + read replica)              │
│  Redis (cache + sessões + rate limit)             │
│  S3/R2 (imagens de produtos scaneados)            │
└──────────────────────────────────────────────────┘
```

Ações necessárias:
- **Cloudflare AI Gateway**: cacheia respostas idênticas do OpenAI por hash de imagem — economia de 30–60% em chamadas
- **Fila de processamento**: Bull/BullMQ + Redis para processar frames fora do ciclo request-response
- **Read replica**: queries de leitura (listas, histórico) vão para replica
- **Imagens**: salvar frames dos scans em R2/S3 para auditoria e fine-tuning futuro
- **Auth real**: migrar de household_id anônimo para JWT + refresh token

Custo estimado: ~$150–400/mês

#### Nível 4 — 50.000+ usuários/mês (escala)

- Migrar para Kubernetes (GKE/EKS) com HPA por CPU/fila
- Separar serviço de IA (workers dedicados com GPU para modelos próprios)
- Fine-tune de modelo próprio com dados coletados nas fases anteriores
- Sharding de banco por `household_id`
- CDN global de assets de produtos (imagens, metadados)

---

## Banco de Dados

### Schema atual (8 tabelas)

```sql
households          -- unidade de organização (casa/família)
  └── rooms         -- cômodos (Cozinha, Banheiro, etc.)
  └── shopping_lists -- listas por status (open/completed)
        └── list_items ── products  -- itens da lista
  └── scan_sessions  -- sessões de escaneamento
  └── purchase_history -- histórico de compras
        └── restock_patterns -- padrões de reposição por produto
products            -- catálogo global + por household (fingerprint)
```

### Índices críticos para escalar

```sql
-- Já devem existir (adicionar se não tiver):
CREATE INDEX ON list_items (list_id, status);
CREATE INDEX ON products (fingerprint);
CREATE INDEX ON products (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX ON purchase_history (household_id, product_id);
CREATE INDEX ON restock_patterns (household_id, next_restock_estimate);
```

### Evolução futura do schema

- `users` + `household_members` (auth multi-usuário por casa)
- `product_images` (URLs das imagens scaneadas no R2)
- `price_history` (rastrear variação de preço por produto/loja)
- `stores` (lojas com geolocalização para listas por loja)

---

## Segurança

### Implementado no MVP

| Vetor | Mitigação |
|---|---|
| Prompt injection | `sanitizeForPrompt()` strip `<>[]{}\\` + truncate |
| IDOR em listas | Verifica `household_id` antes de qualquer insert |
| IDs inválidos | Regex UUID em todos os params de rota |
| Abuso de API IA | Rate limit 30 req/min em `/api/scan/frame` |
| CORS no produção | `ALLOWED_ORIGIN` obrigatório; crash intencional se ausente |
| Egress de DB | Endpoint privado Railway (sem internet pública) |

### A implementar nas próximas fases

- **Auth JWT**: household_id anônimo não escala para multi-usuário
- **Validação de imagem**: verificar MIME type real do base64 antes de enviar ao OpenAI
- **CSP headers**: Content-Security-Policy para prevenir XSS
- **Audit log**: registrar quem adicionou/removeu cada item
- **HTTPS enforcement**: já garantido pelo Railway; adicionar HSTS header

---

## Fases de Desenvolvimento

### Fase 0 — Infraestrutura base ✅
*Concluída*

- [x] Repositório GitHub (`BMaeda84/Listinha`)
- [x] Monorepo `frontend/` + `backend/`
- [x] Railway: PostgreSQL + backend + frontend
- [x] Schema SQL aplicado (8 tabelas)
- [x] Variáveis de ambiente configuradas
- [x] PWA instalável (manifest + service worker + ícone)
- [x] Rate limiting + CORS + UUID validation
- [x] Segurança: IDOR, prompt injection, sanitização

---

### Fase 1 — Escaneamento funcional
*Em andamento*

**Objetivo**: usuário abre o app, aponta a câmera e itens aparecem na lista automaticamente.

- [ ] Testar pipeline câmera → IA → lista no celular real
- [ ] Ajustar threshold de motion/blur para a câmera móvel
- [ ] Calibrar intervalo de frame (atualmente ~2s entre chamadas)
- [ ] Verificar deduplicação por `fingerprint` em uso real
- [ ] UI de feedback: "Escaneando...", "Item encontrado!", "Câmera desfocada"
- [ ] Teste com produtos brasileiros comuns (Nestlé, Ypê, Sadia, etc.)
- [ ] Fallback de barcode ZXing funcionando

**Entregável**: demo gravada escaneando 10 produtos diferentes sem duplicatas.

---

### Fase 2 — Experiência de lista
*Próxima*

**Objetivo**: listas úteis, organizadas, fáceis de usar no mercado.

- [ ] Tela de lista por cômodo com agrupamento visual
- [ ] Marcar item como comprado (check) via câmera em modo loja
- [ ] Editar quantidade manualmente
- [ ] Remover item com swipe
- [ ] Compartilhar lista (link read-only ou PDF)
- [ ] Arquivar lista concluída com data
- [ ] Busca rápida de produto na lista
- [ ] Modo escuro (sistema)

**Entregável**: fluxo completo — criar lista → escanear mercado → marcar comprados → arquivar.

---

### Fase 3 — Inteligência e padrões
*Médio prazo*

**Objetivo**: o app aprende os hábitos da casa e sugere o que comprar antes de acabar.

- [ ] Registrar `purchase_history` ao concluir lista
- [ ] Calcular `restock_patterns` (frequência média por produto)
- [ ] Dashboard "O que está acabando" com estimativa por data
- [ ] Sugestão de lista automática baseada em padrões
- [ ] Identificar produtos que nunca voltam à lista (descontinuados)
- [ ] Categorias inteligentes por cômodo (itens de gato sempre em "Gatos")
- [ ] Notificação push "Arroz vai acabar em ~3 dias"

**Entregável**: após 4 semanas de uso, o app gera uma lista de compras com 70%+ de precisão.

---

### Fase 4 — Multi-usuário e social
*Longo prazo*

**Objetivo**: mais de uma pessoa por casa usando o app em sincronia.

- [ ] Auth real: e-mail + senha ou Google OAuth
- [ ] Convite de membros por household
- [ ] Edição colaborativa em tempo real (WebSocket ou polling)
- [ ] Comentários em itens ("comprar a marca Y, não a Z")
- [ ] Histórico de quem adicionou cada item
- [ ] Perfis de compras (eu só compro final de semana)

---

### Fase 5 — Expansão e monetização
*Futuro*

**Objetivo**: modelo de negócio sustentável.

- [ ] Plano Free: 1 household, 3 listas simultâneas, 50 scans/dia
- [ ] Plano Pro: ilimitado + padrões avançados + notificações
- [ ] Integração com supermercados (comparador de preço)
- [ ] API para apps de receitas (ingredientes viram lista de compras)
- [ ] Widget iOS/Android na tela de bloqueio com próximos itens
- [ ] Fine-tune de modelo próprio com produtos brasileiros

---

## Stack de Tecnologia

### Atual

| Camada | Tecnologia | Versão |
|---|---|---|
| Frontend | React + Vite | 19 + 8 |
| Estilo | CSS puro (mobile-first) | — |
| Barcode | @zxing/browser | 0.2 |
| Backend | Node.js + Express | 22 + 4 |
| IA | OpenAI gpt-4.1-nano | vision |
| Banco | PostgreSQL | 18 |
| Deploy | Railway | — |
| PWA | Service Worker manual | — |

### Prevista (Fase 2+)

| Camada | Tecnologia | Motivo |
|---|---|---|
| Cache | Redis (Railway) | Barcode lookup, rate limit distribuído |
| Fila | BullMQ | Processar frames de forma assíncrona |
| Auth | JWT + bcrypt | Multi-usuário |
| CDN | Cloudflare Pages | Frontend estático sem custo de egress |
| Storage | Cloudflare R2 | Imagens de produtos ($0.015/GB/mês) |
| Tempo real | Server-Sent Events | Lista colaborativa (mais simples que WS) |

---

## Estimativas de Custo (por fase)

| Fase | Usuários/mês | Infra | OpenAI | Total est. |
|---|---|---|---|---|
| MVP (atual) | < 50 | $15 Railway | < $5 | ~$20/mês |
| Fase 1-2 | 50–500 | $30 Railway | $10–30 | ~$50/mês |
| Fase 3 | 500–2k | $60 Railway + Redis | $30–80 | ~$120/mês |
| Fase 4 | 2k–10k | $150 infra | $100–300 | ~$400/mês |
| Fase 5 | 10k+ | $400+ | modelo próprio | variável |

> **Nota OpenAI**: gpt-4.1-nano com `detail: low` custa ~$0.001 por imagem. Com 50 scans/dia por usuário × 30 dias = 1.500 imagens/usuário/mês. A $0.001 = $1.50/usuário ativo/mês. Modelo próprio (Fase 5) reduz para ~$0.10/usuário.
