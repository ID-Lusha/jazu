# Chatera (get.chatera.ai) — Product Research

> Дата исследования: 25 мая 2026  
> Метод: live-исследование через Playwright MCP, анализ network API, UI-снимки, onboarding-подсказки  
> Ограничения: без оплаты, подключения WhatsApp и отправки реальных данных

---

## Product overview

**Chatera** — SaaS-платформа «AI-менеджер для WhatsApp», которая позволяет владельцу малого бизнеса **настроить AI-агента через обычный чат**, протестировать его в симуляторе клиента и подключить к WhatsApp для автоматических ответов 24/7.

**Ключевая идея:** вместо конструктора сценариев и форм — **разговор с AI-настройщиком**, который сам пишет system prompt, правит его по обратной связи и объясняет изменения человеческим языком.

**Проблема:** SMB теряют клиентов в WhatsApp из-за медленных ответов; настройка классических чат-ботов долгая и требует экспертизы.

**Решение:** «опиши бизнес → получи готового менеджера → протестируй → подключи WhatsApp».

**Домены:**
- Продукт: `https://get.chatera.ai`
- Маркетинг (отдельный лендинг): `https://chatera.ai` — обещает CRM, голос, сценарии (в app dashboard этого не видно)

**Монетизация (обнаружено в UI):**
- Перед подключением WhatsApp: **50 000 ₸ — безлимит диалогов** (единый пакет, без тарифной сетки в интерфейсе)

**Статус авторизации в сессии исследования:**
- Анонимная browser-сессия (`POST /api/session`) — полный доступ к настройке и тесту
- `GET /api/auth/me` → 401 (аккаунт не создан)
- WhatsApp-функции требуют login + оплату

---

## Target audience

| Сегмент | Почему подходит |
|---------|-----------------|
| Салоны красоты, клиники, автосервисы | Запись, FAQ, квалификация заявок |
| Локальный retail / услуги в KZ/CIS | WhatsApp — основной канал, тенге-ценообразование |
| Владелец без технического бэкграунда | Настройка через natural language |
| Solo-предприниматели | Один номер WhatsApp, один агент, простой flow |

**Не для:** enterprise multi-agent contact center, omnichannel CRM, сложные интеграции (в текущем продукте отсутствуют).

---

## Main user flow

```
[Landing /] 
  → описать бизнес → «Начать»
       ↓
[Dashboard /dashboard — режим «Настройка»]
  → диалог с AI-настройщиком
  → AI генерирует system prompt (карточка «Создание/Обновление · N симв.»)
  → уточняющие вопросы (цены, часы работы…)
  → правки через чат или через «Поправить» из теста
       ↓
[Dashboard — режим «Тест»]
  → писать от лица клиента
  → смотреть ответ бота
  → «Поправить» → «Отправить в Настройку» → AI правит prompt
  → «Новый диалог» для нового сценария
       ↓
[Подключить WhatsApp]
  1. Создать аккаунт (magic link email)
  2. Оплатить пакет 50 000 ₸
  3. Сканировать QR
       ↓
[Chats /chats]
  → список реальных диалогов (empty state до подключения)
```

### Onboarding-подсказки (product tour)

| Шаг | Текст | Действие |
|-----|-------|----------|
| 1 | «Построй AI-менеджера для WhatsApp… Расскажи, чем занимаешься?» | Empty state в Настройке |
| 2 | «Агент настроен. Переключитесь в «Тест»…» | Кнопка **Далее** |
| 3 | «Напишите как ваш клиент — проверьте, как менеджер ответит» | Подсказка в режиме Тест |
| 4 | «Не нравится ответ? Нажмите «Поправить»…» | Кнопка **Понятно** |
| 5 | «Подключение к WhatsApp. Когда бот готов — нажмите здесь…» | Кнопка **Понятно** на «Подключить» |

---

## Full feature map

### 1. Настройка бота (Setup / «Настройка»)

| | |
|---|---|
| **Где** | `/dashboard`, вкладка «Настройка», placeholder «Опишите бизнес или поправьте бота…» |
| **Что делает** | Conversational prompt builder: пользователь описывает бизнес, AI создаёт и итеративно редактирует system prompt |
| **UI-элементы** | Чат, карточки «Создание/Обновление · N симв.» (раскрываемый prompt), «Правки · N» (diff), блок «Правка ответа бота», кнопки «Настройка» / «Тест», «Диктовать голосом», «Отправить» |
| **Сценарий** | «Я владелец салона…» → AI собирает prompt → спрашивает что добавить (цены/часы) → пользователь правит текстом или через test-correction |
| **Повторить у нас** | Chat-first onboarding, прозрачный prompt preview, diff правок, action buttons в ответах AI (`switch_to_test`) |

**AI-tools (из API-ответов):**
- `write_prompt` — создание prompt с нуля
- `edit_prompt` — точечные замены (`old_string` / `new_string`)

---

### 2. Подключение WhatsApp

| | |
|---|---|
| **Где** | Кнопка «Подключить» (header), `/whatsapp`, `/chats` (CTA), модал «Подключить WhatsApp» |
| **Что делает** | Wizard: аккаунт → оплата → QR |
| **Поля/кнопки** | «Продолжить», «Назад», «Закрыть», email «you@example.com», «Получить ссылку» |
| **Сценарий** | Готовый агент → Подключить → email → оплата → QR scan |
| **Повторить у us** | 3-step wizard с явным value prop на каждом шаге; сохранение draft-агента до оплаты |

**API:** `GET /api/whatsapp/status` (401 без auth)

**Баг:** на `/whatsapp` отображаются i18n-ключи `auth.titleSignUp` вместо текста.

---

### 3. Тестирование (Test / «Тест»)

| | |
|---|---|
| **Где** | `/dashboard`, вкладка «Тест» |
| **Что делает** | Sandbox: пользователь пишет как клиент, бот отвечает по текущему prompt |
| **UI** | Диалог client/bot, «Поправить», «Новый диалог», placeholder «Напишите от лица клиента…» |
| **Сценарий** | Тестовый запрос → плохой ответ → Поправить → «Как поправить?» → «Отправить в Настройку» → prompt обновляется |
| **Повторить** | Tight loop «test → correct → re-test» без деплоя; отдельная история test-chat |

**API:** `GET /api/test-chat/history`

---

### 4. Аналитика

| | |
|---|---|
| **Где** | **Отдельного раздела нет** в dashboard |
| **Что есть** | `POST /api/analytics/meta-capi` (Meta Conversions API), PostHog session recording (в console/network) |
| **Сценарий** | Product analytics для команды, не для пользователя |
| **Повторить** | MVP: хотя бы счётчики диалогов, hot leads, conversion; позже — dashboard |

---

### 5. Настройки

| | |
|---|---|
| **Где** | **Отдельной страницы `/settings` нет (404)** |
| **Что есть** | «Настройка» = режим чата, не settings page; auth через `/auth` |
| **Auth UI** | Magic link: email → «Получить ссылку», без пароля |
| **Повторить** | Минимум: профиль, billing status, WhatsApp connection status, prompt export |

---

### 6. Тарифы / лимиты

| | |
|---|---|
| **Где** | Модал WhatsApp connect, шаг 2 |
| **Что видно** | **50 000 ₸ — безлимит диалогов** (единственный упомянутый план) |
| **Нет** | `/pricing`, `/billing` — 404; лимитов символов prompt, rate limits в UI нет |
| **Повторить** | Простой one-price go-live; позже — tiers по объёму/номерам |

---

### 7. Интеграции

| | |
|---|---|
| **В app** | **Не обнаружены** (нет CRM, calendar, webhooks UI) |
| **На chatera.ai** | Маркетинг обещает CRM, голос — **не подтверждено в get.chatera.ai** |
| **Повторить (roadmap)** | Google Calendar / YClients для слотов, Telegram notify владельцу, CRM webhook |

---

### 8. Сценарии / промпты

| | |
|---|---|
| **Где** | Prompt живёт в session (`promptDraft`), UI-карточка «Обновление · 3710 симв.» |
| **Формат** | Markdown-like system prompt с секциями: роль, услуги, диалог, запись, escalation, границы |
| **Версионирование** | «Создание» → «Обновление», «Правки · N» с diff; tool output: `Saved version 1. 3710 characters` |
| **Повторить** | Structured prompt template + AI fill; version history; rollback |

**Пример паттернов из prompt:**
- «Горячая заявка: [имя], услуга…» — summary владельцу
- «Передаю администратору: …» — handoff
- Silence 24h после handoff/summary
- Запрет hallucinate слотов/цен

---

### 9. База знаний

| | |
|---|---|
| **Статус** | **Отсутствует как отдельный модуль** |
| **Как работает сейчас** | Знания embedded в system prompt через conversational setup |
| **Повторить** | FAQ upload (PDF/URL) + RAG поверх prompt; sync в prompt sections |

---

### 10. Лиды / диалоги / заявки

| | |
|---|---|
| **Где** | `/chats` — «Диалоги» |
| **Empty state** | «Подключите WhatsApp — реальные диалоги появятся здесь» |
| **Логика лидов** | В prompt: «горячие заявки» → summary в WhatsApp-чат владельца (не отдельная CRM-воронка) |
| **Повторить** | Inbox + lead cards с полями из summary; статусы new/contacted/closed |

---

## UI/UX analysis

### Карта интерфейса

```
get.chatera.ai
├── /                    Landing: hero + business input + «Начать» + «Войти»
├── /auth                Magic link login
├── /dashboard           ★ Main workspace (single-page experience)
│   ├── Header: Logo | «Подключить»
│   ├── Mode toggle: [Настройка] [Тест]
│   ├── Chat area (setup history | test dialog)
│   ├── Prompt cards: Создание/Обновление, Правки
│   ├── Correction card: «Правка ответа бота»
│   └── Composer: textarea + voice + send
├── /chats               Real WhatsApp dialogs (gated)
└── /whatsapp            WhatsApp connect page (partial/broken i18n)
```

### Состояния dashboard

| Состояние | UI |
|-----------|-----|
| Empty setup | Приветствие + пустой чат |
| Generating | (inferred) `isGenerating` в session API |
| Setup with prompt | История + карточка prompt + AI questions |
| Test empty | «Напишите как ваш клиент…» |
| Test with messages | Client/bot bubbles + «Поправить» |
| Connect modal | 3-step wizard |
| Unauthenticated | Полный setup/test; WhatsApp → signup |

### Сильные стороны (UX)

1. **Zero-config entry** — одно текстовое поле на лендинге и в dashboard
2. **Dual-mode toggle** (Настройка/Тест) — понятное разделение ролей
3. **Explainable AI** — AI объясняет *почему* изменил prompt («убрал раннюю передачу…»)
4. **Visible prompt** — power users видят 3710 симв.; trust через transparency
5. **Correction loop** — «Поправить» без знания prompt engineering
6. **Progressive monetization** — полная настройка бесплатно до WhatsApp
7. **Voice input** — «Диктовать голосом» для mobile-first аудитории
8. **Onboarding tooltips** — короткие contextual hints, не блокирующий wizard

### Слабые места / улучшения

1. **Нет навигации** — только logo + Подключить; `/chats` не виден в menu
2. **Нет settings/billing UI** — пользователь не видит статус подписки
3. **Нет analytics для клиента** — нет ROI dashboard
4. **Broken `/whatsapp` i18n** — `auth.titleSignUp` raw keys
5. **Diff UI** — «Правки» показывает corrupted merge text (баг визуализации)
6. **Один агент** — нет multi-business / multi-location
7. **Нет KB/RAG UI** — всё в prompt, плохо масштабируется
8. **Маркeting vs product gap** — chatera.ai обещает CRM/голос, app — только WhatsApp AI manager
9. **Console errors** — множество 401/404 в network при anonymous session
10. **Нет explicit «Сохранено»** — session-based, риск потери без email signup

---

## Technical assumptions

| Слой | Предположение | Доказательства |
|------|---------------|----------------|
| Frontend | Next.js App Router, RSC, PWA (`manifest.webmanifest`) | `_next/static`, `_rsc` requests |
| Backend API | Node.js + Fastify (`Route GET:/api/... not found`) | 404 message format |
| DB | MongoDB | `_id`, session document shape |
| AI | OpenAI (reasoning models, tool calls) | `tool-write_prompt`, `reasoning` parts, `openai` metadata |
| Session | Anonymous cookie session → merge on auth | `POST /api/session`, fields in session |
| Analytics | PostHog + Meta CAPI | network requests, posthog-recorder.js |
| WhatsApp | Likely Baileys / WhatsApp Web QR (не Meta Cloud API — «сканируете QR») | UI copy |
| i18n | i18next or similar | broken keys on /whatsapp |
| Auth | Magic link email | `/auth` UI |
| Payments | Unknown provider (local KZ?) | 50 000 ₸, step 2 wizard |

### Discovered API endpoints

| Method | Endpoint | Auth | Назначение |
|--------|----------|------|------------|
| POST | `/api/session` | cookie | Create/restore anonymous session |
| GET | `/api/agent/history` | session | Setup chat history |
| GET | `/api/agent/prompt` | session | Current prompt draft |
| GET | `/api/test-chat/history` | session | Test chat history |
| GET | `/api/auth/me` | user | Current user (401 anon) |
| GET | `/api/whatsapp/status` | user | WA connection status |
| POST | `/api/analytics/meta-capi` | — | Meta pixel/CAPI events |

**Inferred (streaming chat, not probed with POST body):**
- `POST /api/agent/*` — setup messages (SSE/stream)
- `POST /api/test-chat/*` — test messages
- `POST /api/auth/*` — send magic link
- Payment + WhatsApp QR endpoints after auth

### Session document shape (from API)

```json
{
  "sessionId": "string",
  "promptDraft": "string",
  "promptBuilderHistory": [],
  "testBotHistory": [],
  "testBotStage": "",
  "readyToFinalize": false,
  "isGenerating": false,
  "createAgentHistory": []
}
```

---

## MVP scope

Минимальный продукт «как Chatera, но проще» для первых 4–6 недель:

### Включить в MVP

- [ ] Landing с одним полем «опишите бизнес»
- [ ] Anonymous session + сохранение draft
- [ ] Dashboard с режимами **Настройка** / **Тест**
- [ ] AI prompt builder (chat → system prompt)
- [ ] Prompt preview + version counter
- [ ] Test sandbox с correction → update prompt
- [ ] Magic link auth перед go-live
- [ ] WhatsApp QR connect (1 номер)
- [ ] Простой inbox `/chats` (список + просмотр)
- [ ] Hot lead notification (summary в WA/Telegram владельцу)
- [ ] Один тариф / paywall перед connect

### Отложить post-MVP

- CRM интеграции, calendar sync
- RAG / file knowledge base
- Multi-agent / team inbox
- Broadcast, CS monitoring
- Voice dictation (можно stub)
- Admin panel (кроме basic user list)
- Detailed analytics
- Multi-language UI

---

## Database entities

```text
users
  id, email, created_at, subscription_status, payment_id

sessions (anonymous → merged)
  id, session_id, user_id?, prompt_draft, created_at, updated_at

prompt_versions
  id, session_id|user_id, content, char_count, version, source (create|edit|correction), created_at

messages
  id, conversation_id, role (user|assistant), content, parts (json), created_at

conversations
  id, type (setup|test|whatsapp), user_id, external_chat_id?, created_at

whatsapp_connections
  id, user_id, phone, status (disconnected|qr|connected), session_data (encrypted), connected_at

whatsapp_messages
  id, connection_id, conversation_id, direction, body, wa_message_id, created_at

leads
  id, conversation_id, summary, service, preferred_time, status, created_at

payments
  id, user_id, amount, currency, provider_ref, status, created_at

onboarding_state
  user_id|session_id, completed_steps (json)
```

---

## API endpoints draft

```text
# Session
POST   /api/session              # create/restore
GET    /api/session              # current session

# Auth
POST   /api/auth/magic-link      # { email }
GET    /api/auth/me
POST   /api/auth/logout

# Agent setup
GET    /api/agent/history
GET    /api/agent/prompt
POST   /api/agent/chat           # stream SSE { message }
GET    /api/agent/versions

# Test
GET    /api/test-chat/history
POST   /api/test-chat/chat       # stream
POST   /api/test-chat/reset
POST   /api/test-chat/correct    # { botMessage, correction } → triggers setup edit

# WhatsApp
GET    /api/whatsapp/status
POST   /api/whatsapp/qr          # initiate QR session
GET    /api/whatsapp/qr          # poll QR / connection state
DELETE /api/whatsapp/disconnect

# Chats
GET    /api/chats                # list
GET    /api/chats/:id/messages

# Billing
POST   /api/billing/checkout
GET    /api/billing/status
POST   /api/billing/webhook

# Leads (optional MVP)
GET    /api/leads
PATCH  /api/leads/:id
```

---

## AI prompt logic

### Architecture

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ User message    │────▶│ Setup Agent      │────▶│ promptDraft     │
│ (setup/test/    │     │ (tools: write,   │     │ (MongoDB)       │
│  correction)    │     │  edit_prompt)    │     └────────┬────────┘
└─────────────────┘     └──────────────────┘              │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ WhatsApp client │◀───▶│ Runtime Agent    │◀────│ system prompt   │
│ message         │     │ (no tools /      │     │ + conversation  │
└─────────────────┘     │  minimal tools)  │     │ history         │
                        └──────────────────┘     └─────────────────┘
```

### Setup Agent system prompt (meta)

- Роль: expert prompt engineer для WhatsApp SMB bots
- Input: описание бизнеса, corrections
- Output: friendly explanation + tool calls
- Tools: `write_prompt(content)`, `edit_prompt(old_string, new_string, replace_all)`
- Constraints: safety rules (no fake bookings), locale RU/KZ, short WA messages

### Runtime Agent system prompt (generated)

Шаблон секций (по образцу Chatera):

1. Роль и тон
2. Услуги/продукты
3. Главная задача
4. Правила диалога
5. Сбор заявки (без подтверждения слотов)
6. Поля по типам услуг
7. Формат «Горячая заявка»
8. Условия handoff «Передаю администратору»
9. Anti-spam / off-topic
10. Guardrails (не выдумывать цены/слоты)

### Correction flow

```text
Test bot reply → User clicks «Поправить» → Enters natural language fix
  → POST correct → Setup Agent receives:
     "Правлю ответ бота: «{reply}»\n\n{correction}"
  → edit_prompt tool calls → Updated draft
  → User re-tests in Test mode
```

### Action buttons (JSON in assistant message)

```json
{ "action_button": { "type": "switch_to_test", "label": "Протестировать" } }
```

---

## WhatsApp integration plan

### Рекомендуемый подход для MVP

**Phase 1 — QR Web (как Chatera UI suggests):**
- Baileys / whatsapp-web.js worker per user
- QR rendered in `/whatsapp` page, poll until connected
- Store encrypted auth state in DB
- Pros: быстрый старт, без Meta Business verification
- Cons: риск бана, неофициальный, не scale enterprise

**Phase 2 — WhatsApp Business Cloud API:**
- Meta Business Manager, WABA, webhook
- Template messages для outbound
- Pros: stable, official
- Cons: onboarding friction, conversation pricing

### Message flow

```text
Inbound WA → Webhook/Worker → Load user prompt + chat history
  → LLM generate reply → Send WA message
  → If summary/handoff pattern detected → Notify owner + pause bot 24h
```

### Owner notification

Chatera pattern: bot пишет summary **в тот же WhatsApp-чат** или отдельному номеру владельца. MVP: дублировать в Telegram bot.

---

## Development roadmap

### Phase 1 — Foundation (Week 1–2)

**Frontend**
- Next.js app: `/`, `/auth`, `/dashboard`, `/chats`
- Layout header, mode toggle, chat components
- Session bootstrap on load

**Backend**
- Fastify/Nest API + MongoDB
- Session middleware (anonymous cookie)
- `POST /api/session`, history CRUD

**DB**
- users, sessions, messages, prompt_versions

### Phase 2 — AI Core (Week 2–3)

**AI-логика**
- Setup agent with write/edit prompt tools (OpenAI)
- SSE streaming for setup + test chats
- Prompt template generator

**Frontend**
- Prompt preview card, diff view
- Test mode + correction modal

### Phase 3 — Auth & Billing (Week 3–4)

**Backend**
- Magic link auth (Resend/Postmark)
- Merge anonymous session → user on login
- Payment integration (Kaspi/Stripe/local)
- Paywall gate on WhatsApp connect

**Frontend**
- Connect wizard modal (3 steps)

### Phase 4 — WhatsApp (Week 4–5)

**WhatsApp**
- QR connect worker
- Inbound/outbound message handler
- Runtime agent invocation
- Hot lead detection + owner notify

**Frontend**
- `/chats` inbox (list + thread view)
- Connection status indicator

### Phase 5 — Polish (Week 5–6)

**Analytics**
- PostHog/Mixpanel events
- Basic admin: users, connections, MRR

**Deploy**
- Frontend: Vercel
- API: Railway/Fly.io
- Worker: separate service for WA sessions
- MongoDB Atlas
- Redis for sessions/queues

### Phase 6 — Post-MVP

- KB/RAG upload
- Calendar integration
- Multi-language
- Team access
- CRM webhooks
- Meta Cloud API migration

---

## Risks and unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| WhatsApp Web ban | High | Migrate to Cloud API; warn users |
| LLM hallucinations (slots/prices) | High | Strong guardrails + human handoff (как у Chatera) |
| Prompt injection via end customers | Medium | Separate runtime from setup; output filters |
| Anonymous session loss | Medium | Aggressive «save email» CTA before big prompts |
| Payment provider KZ | Medium | Research Kaspi Pay / local acquiring |
| Scale WA workers | High | 1 container per connection → orchestration needed |
| Meta CAPI without full funnel | Low | Analytics only |
| Product name collision (chatera.id, chattera.io) | Medium | Distinct branding |
| **Unknown:** post-payment flow UI | — | Requires authenticated test |
| **Unknown:** real chats UI structure | — | Requires connected WA |
| **Unknown:** rate limits / fair use «безлимит» | — | ToS review |
| **Unknown:** voice dictation provider | — | Web Speech API or Whisper |

---

## Что повторить в нашем продукте (priority)

1. **Chat-first bot setup** — главная дифференциация
2. **Setup/Test dual mode** — простая mental model
3. **Correction → auto prompt edit** — без prompt engineering
4. **Transparent prompt card** — trust + power users
5. **Explainable diff** — «что и почему изменилось»
6. **Free build, pay to connect** — low friction acquisition
7. **Hot lead summary format** — structured handoff в мессенджер
8. **Guardrails template** — no fake bookings/prices out of the box
9. **Contextual onboarding tooltips** — не modal wizard
10. **Single-field landing** — мгновенный time-to-value

---

## Appendix: Pages availability matrix

| Route | Status | Notes |
|-------|--------|-------|
| `/` | 200 | Landing |
| `/auth` | 200 | Magic link |
| `/dashboard` | 200 | Main app |
| `/chats` | 200 | Empty until WA |
| `/whatsapp` | 200 | i18n broken |
| `/settings` | 404 | — |
| `/analytics` | 404 | — |
| `/pricing` | 404 | Price only in modal |
| `/onboarding` | 404 | Tooltips inline |

---

*Исследование проведено без изменения production-настроек и без завершения оплаты/подключения WhatsApp.*
