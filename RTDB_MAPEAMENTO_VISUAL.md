# Mapeamento Visual - Consumo do RTDB

## 🌳 Árvore de Dependências

```
┌─────────────────────────────────────────────────────────────────┐
│  src/firebase.js                                                │
│  ├─ export const db = getDatabase(app)                          │
│  ├─ export const firestore = initializeFirestore(app)           │
│  └─ export const storage = getStorage(app)                      │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
    [ADMIN]   [USER CREATION]  [USER VIEW]
    (5)          (6)              (7)
        │            │            │
        ├────────────┼────────────┤
        │            │            │
        ▼            ▼            ▼
    Cloud Funct  Components  Configuration
     (1)          (1)         (1)
```

---

## 📊 Matriz de Consumo Detalhada

### NÚCLEO
```
[firebase.js]  
├─ Imports: getDatabase
├─ Exports: db (Realtime Database instance)
├─ Dependências: 19 arquivos
└─ Criticidade: 🔴 CRÍTICA - Não pode ser removida sem refatoração
```

---

### PAINÉIS ADMIN (5 arquivos)

```
[AdminProcon.js]
├─ Path: src/pages/pagesAdmin/AdminProcon.js
├─ Imports: ref, query, orderByKey, limitToLast, update, push, set, serverTimestamp, get
├─ Nós RTDB:
│  ├─ {city}/denuncias-procon              [READ QUERY] [WRITE UPDATE/PUSH]
│  ├─ {city}/denuncias-procon/{id}/arquivos [WRITE UPDATE]
│  ├─ {city}/denuncias-procon/{id}/messages [WRITE PUSH/SET]
│  ├─ {city}/notifications                 [WRITE PUSH/SET]
│  └─ {city}/users/{userId}                [READ GET]
├─ Padrões:
│  ├─ Leitura: ref() + query() + orderByKey() + limitToLast() + get()
│  ├─ Criação: ref() + push() + set()
│  ├─ Atualização: ref() + update()
│  └─ Listeners: ❌ Não usa
├─ Fluxo:
│  1. Busca todas denúncias (últimas 200) com ordenação
│  2. Renderiza tabela de status
│  3. Modal pode:
│     - Atualizar status (trigger notificação)
│     - Enviar mensagem
│     - Fazer upload de arquivo
├─ Criticidade: 🔴 CRÍTICA
└─ Frequência: ALTA (admin consultando constantemente)

┌─────────────────────────────────────────┐
│  Fluxo no AdminProcon                   │
├─────────────────────────────────────────┤
│  Page Load:                             │
│  ├─ GET denuncias-procon (últimas 200) │
│  └─ setDenuncias()                      │
│                                         │
│  Abrir Modal:                           │
│  ├─ GET users/{userId}                 │
│  └─ setConsumerProfile()                │
│                                         │
│  Mudar Status:                          │
│  ├─ UPDATE denuncias-procon/{id}       │
│  ├─ PUSH notificações                  │
│  └─ addDoc(firestore, 'mail')          │
│                                         │
│  Enviar Mensagem:                       │
│  ├─ PUSH denuncias-procon/{id}/messages│
│  └─ SET nova mensagem                  │
│                                         │
│  Upload Arquivo:                        │
│  ├─ Upload Storage                      │
│  └─ UPDATE arquivos array               │
└─────────────────────────────────────────┘
```

```
[AdminProcuradoria.js]
├─ Path: src/pages/pagesAdmin/AdminProcuradoria.js
├─ Imports: ref, query, orderByKey, limitToLast, update, push, set, serverTimestamp, get
├─ Nós RTDB:
│  ├─ {city}/procuradoria-mulher
│  ├─ {city}/procuradoria-mulher/{id}/messages
│  ├─ {city}/notifications
│  └─ {city}/users/{userId}
├─ Padrões: ❌ IDÊNTICO ao AdminProcon
├─ Criticidade: 🔴 CRÍTICA
└─ Status: CÓDIGO DUPLICADO ⚠️

[AdminJuridico.js]
├─ Path: src/pages/pagesAdmin/AdminJuridico.js
├─ Imports: ref, query, orderByKey, limitToLast, update, push, set, serverTimestamp, get
├─ Nós RTDB:
│  ├─ {city}/atendimento-juridico
│  ├─ {city}/atendimento-juridico/{id}/messages
│  ├─ {city}/notifications
│  └─ {city}/users/{userId}
├─ Padrões: ❌ IDÊNTICO ao AdminProcon
├─ Criticidade: 🔴 CRÍTICA
└─ Status: CÓDIGO DUPLICADO ⚠️

[AdminVereadores.js]
├─ Path: src/pages/pagesAdmin/AdminVereadores.js
├─ Imports: ref, get, push, update, remove
├─ Nós RTDB:
│  ├─ {city}/solicitacoes-vereadores  [READ]
│  ├─ {city}/vereadores               [CRUD COMPLETO]
│  └─ {city}/users/{userId}           [READ]
├─ Padrões:
│  ├─ Leitura: ref() + get()
│  ├─ Criação: ref() + push()
│  ├─ Atualização: ref() + update()
│  └─ Deleção: ref() + remove()
├─ Criticidade: 🟠 ALTA
└─ Frequência: MÉDIA

[AdminPiel.js]
├─ Path: src/pages/pagesAdmin/AdminPiel.js
├─ Imports: ref, get, update, push, remove, serverTimestamp
├─ Nós RTDB:
│  ├─ {city}/piel [CRUD COMPLETO]
│  └─ {city}/users/{userId}
├─ Padrões: CRUD Completo
├─ Criticidade: 🟠 ALTA
└─ Frequência: MÉDIA

[AdminMigration.js]
├─ Path: src/pages/pagesAdmin/AdminMigration.js
├─ Imports: ref, get
├─ Nós RTDB: (Varia - ferramenta de migração)
├─ Padrões: Apenas leitura
├─ Criticidade: 🟡 MÉDIO
└─ Frequência: BAIXA (ferramenta admin)
```

---

### CRIAÇÃO DE DENÚNCIAS/SOLICITAÇÕES (6 arquivos)

```
[realizarReclamacaoProcon.js]
├─ Path: src/pages/pagesUser/realizarReclamacaoProcon.js
├─ Imports: ref, push, get
├─ Nós RTDB:
│  ├─ {city}/users/{userId}        [READ GET]
│  └─ {city}/denuncias-procon      [CREATE PUSH]
├─ Padrões:
│  ├─ Leitura: ref() + get() [Busca perfil antes de enviar]
│  └─ Criação: ref() + push() [Cria nova denúncia]
├─ Fluxo:
│  1. User acessa formulário
│  2. fetchUserData() → GET users/{userId}
│  3. Preenche form
│  4. handleSubmit() → PUSH denuncias-procon
│  5. Gera PDF
│  6. Redireciona para dashboard
├─ Criticidade: 🔴 CRÍTICA
└─ Frequência: ALTA (cidadão criando denúncias)

[NovoAtendimentoJuridico.js]
├─ Path: src/pages/pagesUser/NovoAtendimentoJuridico.js
├─ Imports: ref, get, push, set, serverTimestamp
├─ Nós RTDB:
│  ├─ {city}/users/{userId}         [READ GET]
│  └─ {city}/atendimento-juridico  [CREATE PUSH+SET]
├─ Padrões: Idêntico ao realizarReclamacaoProcon
├─ Criticidade: 🔴 CRÍTICA
└─ Frequência: ALTA

[NovaProcuradoria.js]
├─ Path: src/pages/pagesUser/NovaProcuradoria.js
├─ Imports: ref, get, push, set, serverTimestamp
├─ Nós RTDB:
│  ├─ {city}/users/{userId}          [READ GET]
│  └─ {city}/procuradoria-mulher   [CREATE PUSH+SET]
├─ Padrões: Idêntico ao realizarReclamacaoProcon
├─ Criticidade: 🔴 CRÍTICA
└─ Frequência: ALTA

[NovaSolicitacaoVereador.js]
├─ Path: src/pages/pagesUser/NovaSolicitacaoVereador.js
├─ Imports: ref, get, push, set, serverTimestamp, query, orderByChild, equalTo
├─ Nós RTDB:
│  ├─ {city}/users/{userId}              [READ GET]
│  ├─ {city}/solicitacoes-vereadores  [CREATE PUSH+SET + READ QUERY]
│  └─ {city}/vereadores                 [READ QUERY]
├─ Padrões:
│  ├─ Leitura: ref() + query() + orderByChild() + equalTo() + get()
│  └─ Criação: ref() + push() + set()
├─ Criticidade: 🔴 CRÍTICA
└─ Frequência: ALTA

[ConfigurarPanico.js]
├─ Path: src/pages/pagesUser/ConfigurarPanico.js
├─ Imports: ref, get, set
├─ Nós RTDB:
│  ├─ {city}/procuradoria-mulher-btn-panico/{userId}  [READ GET + WRITE SET]
│  └─ {city}/users/{userId}                           [READ GET]
├─ Padrões:
│  ├─ Leitura: ref() + get()
│  └─ Atualização: ref() + set()
├─ Criticidade: 🟠 ALTO
└─ Frequência: MÉDIA (config pessoal)

[NovaOuvidoria.js]
├─ Path: src/pages/pagesUser/NovaOuvidoria.js
├─ Imports: (não encontrado no grep, mas há push() em código)
├─ Nós RTDB:
│  └─ {city}/ouvidoria  [CREATE]
├─ Padrões: Idêntico ao realizarReclamacaoProcon
├─ Criticidade: 🟠 ALTO
└─ Frequência: ALTA
```

---

### VISUALIZAÇÃO/LISTAGEM (7 arquivos)

```
[AtendimentoJuridico.js]
├─ Path: src/pages/pagesUser/AtendimentoJuridico.js
├─ Imports: ref, get, query, orderByChild, equalTo, onValue
├─ Nós RTDB:
│  ├─ {city}/atendimento-juridico      [READ QUERY + LISTENER onValue]
│  ├─ {city}/users/{userId}            [READ GET]
│  └─ {city}/atendimento-juridico/{id} [READ GET para detalhes]
├─ Padrões:
│  ├─ Listener Reativo: onValue() com query por userId
│  └─ Detalhes: ref() + get() por ID
├─ Fluxo:
│  1. Component monta
│  2. Executa query: {atendimento-juridico} WHERE userId == currentUser.uid
│  3. onValue() listener atualiza state em tempo real
│  4. User clica em item
│  5. GET detalhes completos
├─ Criticidade: 🔴 CRÍTICA
├─ Frequência: ALTA (user consultando constantemente)
└─ ⚠️ PROBLEMA: Listener sempre ativo = tráfego constante

[Ouvidoria.js]
├─ Path: src/pages/pagesUser/Ouvidoria.js
├─ Imports: ref, get, query, orderByChild, equalTo, onValue
├─ Nós RTDB:
│  ├─ {city}/ouvidoria         [READ QUERY + LISTENER onValue]
│  └─ {city}/users/{userId}    [READ GET]
├─ Padrões: ❌ IDÊNTICO ao AtendimentoJuridico
├─ Criticidade: 🔴 CRÍTICA
└─ ⚠️ PROBLEMA: Listener sempre ativo

[Procuradoria.js]
├─ Path: src/pages/pagesUser/Procuradoria.js
├─ Imports: ref, get, query, orderByChild, equalTo, onValue
├─ Nós RTDB:
│  ├─ {city}/procuradoria-mulher                    [READ QUERY + LISTENER]
│  ├─ {city}/procuradoria-mulher-btn-panico/{userId} [READ GET]
│  └─ {city}/users/{userId}                        [READ GET]
├─ Padrões: ❌ IDÊNTICO ao AtendimentoJuridico
├─ Criticidade: 🔴 CRÍTICA
└─ ⚠️ PROBLEMA: Listener sempre ativo

[SolicitacoesVereadores.js]
├─ Path: src/pages/pagesUser/SolicitacoesVereadores.js
├─ Imports: ref, get, query, orderByChild, equalTo, onValue
├─ Nós RTDB:
│  ├─ {city}/solicitacoes-vereadores    [READ QUERY + LISTENER onValue]
│  └─ {city}/users/{userId}             [READ GET]
├─ Padrões: ❌ IDÊNTICO ao AtendimentoJuridico
├─ Criticidade: 🔴 CRÍTICA
└─ ⚠️ PROBLEMA: Listener sempre ativo

[ProconAtendimentos.js]
├─ Path: src/pages/pagesUser/ProconAtendimentos.js
├─ Imports: getDatabase, ref, query, orderByChild, equalTo, get
├─ Nós RTDB:
│  └─ {city}/denuncias-procon [READ QUERY GET]
├─ Padrões:
│  ├─ Import raro: getDatabase() direto (não via firebase.js)
│  └─ Query: ref() + query() + orderByChild() + equalTo() + get()
├─ Criticidade: 🟠 ALTO
└─ Frequência: MÉDIA

[Painel.js]
├─ Path: src/pages/pagesUser/Painel.js
├─ Imports: ref, get
├─ Nós RTDB:
│  └─ {city}/users/{userId} [READ GET]
├─ Padrões: Simples leitura
├─ Criticidade: 🟡 MÉDIO
└─ Frequência: ALTA (dashboard)
```

---

### COMPONENTES REUTILIZÁVEIS (1 arquivo)

```
[VereadoresSlider.js]
├─ Path: src/components/VereadoresSlider.js
├─ Imports: ref, get
├─ Nós RTDB:
│  └─ {city}/vereadores [READ GET]
├─ Padrões: Simples leitura
├─ Criticidade: 🟡 MÉDIO
├─ Frequência: ALTA (usado em múltiplas páginas)
└─ Usado em:
   ├─ NovaSolicitacaoVereador.js
   ├─ HomePage.js (provavelmente)
   └─ Outras páginas
```

---

### CLOUD FUNCTIONS (1 arquivo)

```
[functions/index.js]
├─ Path: functions/index.js
├─ Imports: onValueCreated (RTDB trigger), onSchedule (scheduler)
├─ Nós RTDB:
│  ├─ {city}/mail                              [TRIGGER onValueCreated + REMOVE]
│  ├─ {city}/balcao-config/bookedSlots         [REMOVE em cleanup]
│  └─ {city}/* (solicitações)                  [REMOVE agendado]
│
├─ Função 1: sendMailOnNewRequest
│  ├─ Trigger: onValueCreated('{city}/mail/{pushId}')
│  ├─ Ação:
│  │  1. Lê dados do email
│  │  2. Envia via Gmail
│  │  3. REMOVE {city}/mail/{pushId}  ← DELETA após envio
│  └─ Criticidade: 🔴 CRÍTICA (sistema de notificações)
│
├─ Função 2: cleanupExpiredRequests
│  ├─ Trigger: onSchedule('every 1 hours')
│  ├─ Ação:
│  │  1. Busca solicitações expiradas
│  │  2. Limpa arquivos do Storage
│  │  3. REMOVE slots de agendamento em {city}/balcao-config/bookedSlots
│  │  4. REMOVE registro da solicitação
│  └─ Criticidade: 🔴 CRÍTICA (manutenção do sistema)
│
├─ Padrões:
│  └─ Usa Admin SDK (não SDK client)
│  └─ snapshot.ref.remove()
│  └─ snapshot.ref.root.child(path).remove()
│
└─ ⚠️ ATENÇÃO: Cloud Functions são críticas e precisam ser reescritas para Firestore
```

---

## 📈 Matriz de Impacto de Mudança

```
FACILIDADE DE MIGRAÇÃO POR PADRÃO

┌─────────────────────────────────────────────────────────┐
│ PADRÃO              │ DIFICULDADE │ IMPACTO │ ARQUIVOS  │
├─────────────────────────────────────────────────────────┤
│ ref() + get()       │ ✅ Fácil     │ Baixo   │ 8        │
│ ref() + push()      │ ✅ Fácil     │ Médio   │ 6        │
│ ref() + update()    │ ✅ Fácil     │ Médio   │ 5        │
│ ref() + set()       │ ✅ Fácil     │ Médio   │ 6        │
│ query() + equalTo() │ ⚠️ Médio     │ Médio   │ 7        │
│ onValue()           │ ⚠️ Médio     │ ALTO    │ 7        │ ← Crítico
│ Cloud Functions     │ ❌ Difícil   │ CRÍTICO │ 1        │
└─────────────────────────────────────────────────────────┘

REESCRITA NECESSÁRIA POR ARQUIVO

ref() + get()           →  getDoc() / getDocs()        ✅ 1 linha
ref() + push()          →  addDoc()                    ✅ 1 linha
ref() + update()        →  updateDoc()                 ✅ 1 linha
ref() + set()           →  setDoc()                    ✅ 1 linha
query() + orderByChild()→  query() + where()           ⚠️ 2-3 linhas
query() + equalTo()     →  query() + where()           ⚠️ 2-3 linhas
onValue()               →  onSnapshot()                ⚠️ 2-5 linhas
Cloud Functions         →  Reescrita completa          ❌ 20-30 linhas
```

---

## 🔗 Dependências Entre Arquivos

```
firebase.js (central)
    │
    ├─────────────────────────────────┬──────────────────┬──────────────┐
    │                                 │                  │              │
    ▼ (19 arquivos)                   │                  │              │
ADMIN DASHBOARDS                      │                  │              │
├─ AdminProcon.js       ───┐          │                  │              │
├─ AdminProcuradoria.js ──┤          │                  │              │
├─ AdminJuridico.js     ──┼─→ Notificações → firestore  │              │
├─ AdminVereadores.js   ──┤    (mail collection)         │              │
└─ AdminPiel.js         ───┘                              │              │
                                                          │              │
    USER CREATION PAGES                                  │              │
├─ realizarReclamacaoProcon.js                           │              │
├─ NovoAtendimentoJuridico.js ──┐                         │              │
├─ NovaProcuradoria.js          ├─→ Storage (already ✅)  │              │
├─ NovaSolicitacaoVereador.js ──┤                         │              │
├─ ConfigurarPanico.js          │                        │              │
└─ NovaOuvidoria.js ────────────┘                         │              │
                                                          │              │
    USER VIEW PAGES                                       │              │
├─ AtendimentoJuridico.js ──┐                             │              │
├─ Ouvidoria.js             ├─→ Listeners reativo        │              │
├─ Procuradoria.js          │    (onValue)               │              │
├─ SolicitacoesVereadores.js ─┘                          │              │
├─ ProconAtendimentos.js                                 │              │
└─ Painel.js                                             │              │
                                                          │              │
    COMPONENTS                                            │              │
└─ VereadoresSlider.js                                   │              │
                                                          │              │
    CLOUD FUNCTIONS                                       │              │
└─ functions/index.js ───────────────────────────────────┴──────────────┘
   ├─ Triggers: onValueCreated({city}/mail/{pushId})
   └─ Scheduled: onSchedule('every 1 hours')
```

---

## 💾 Estrutura de Dados Completa Mapeada

```javascript
{
  // COLLECTION POR CIDADE
  [city]/
  {
    // 👤 USUÁRIOS
    users/
    {
      [userId]/
      {
        name,
        email,
        phone,
        address,
        neighborhood,
        city,
        state,
        cep,
        sexo,
        tipo (Cidadão | Admin)
      }
    }

    // 📋 PROCON - DENÚNCIAS
    denuncias-procon/
    {
      [denunciaId]/
      {
        protocolo,
        userId,
        companyName,
        cnpjEmpresaReclamada,
        status,
        createdAt,
        deletionTimestamp (se finalizada),
        arquivos[],
        messages/
        {
          [msgId]/
          {
            text,
            sender (admin | user),
            timestamp
          }
        }
      }
    }

    // ⚖️ JURÍDICO
    atendimento-juridico/
    {
      [atendimentoId]/
      {
        userId,
        createdAt,
        arquivos[],
        messages/
        {
          [msgId]/ { ... }
        }
      }
    }

    // 👩‍⚖️ PROCURADORIA
    procuradoria-mulher/
    {
      [procurariaId]/
      {
        userId,
        createdAt,
        arquivos[],
        messages/
        {
          [msgId]/ { ... }
        }
      }
    }

    procuradoria-mulher-btn-panico/
    {
      [userId]/
      {
        contatos[] (emergência)
      }
    }

    // 👨‍💼 VEREADORES
    vereadores/
    {
      [vereadorId]/
      {
        name,
        photo,
        partido,
        email
      }
    }

    solicitacoes-vereadores/
    {
      [solicitacaoId]/
      {
        userId,
        vereadorId,
        createdAt,
        arquivos[]
      }
    }

    // 🗣️ OUVIDORIA
    ouvidoria/
    {
      [ouvipdoriaId]/
      {
        userId,
        createdAt,
        descricao,
        arquivos[]
      }
    }

    // 📱 PIEL
    piel/
    {
      [pielId]/
      {
        userId,
        createdAt
      }
    }

    // 📬 NOTIFICAÇÕES
    notifications/
    {
      [notifId]/
      {
        targetUserId,
        protocolo,
        tituloNotification,
        descricaoNotification,
        timestamp,
        isRead
      }
    }

    // 📧 FILA DE EMAILS (Cloud Functions)
    mail/
    {
      [pushId]/
      {
        to,
        message/
        {
          subject,
          html
        },
        timestamp
      }
    }

    // 📅 CONFIGURAÇÃO DE AGENDAMENTOS
    balcao-config/
    {
      availability/
      {
        morning_start,
        morning_end,
        afternoon_start,
        afternoon_end
      }

      bookedSlots/
      {
        [date]/
        {
          [time]: true
        }
      }

      blockedDates/
      {
        dates[]
      }
    }
  }
}
```

---

## 📊 Estatísticas Finais

```
TOTAL POR TIPO DE OPERAÇÃO
────────────────────────────
GET (leitura simples):          12 arquivos
QUERY (leitura com filtro):      7 arquivos
LISTENER (reativo onValue):      7 arquivos
PUSH (criação):                  6 arquivos
SET (atualização/criação):       8 arquivos
UPDATE (atualização):            5 arquivos
REMOVE (deleção):                3 arquivos
serverTimestamp:                 8 arquivos

ARQUIVOS CRÍTICOS (>1 função crítica cada)
──────────────────────────────────────────
AdminProcon.js                   ✅ 7 funções
AdminProcuradoria.js             ✅ 7 funções
AdminJuridico.js                 ✅ 7 funções
AtendimentoJuridico.js          ✅ 4 funções (+ listener contínuo)
Ouvidoria.js                    ✅ 4 funções (+ listener contínuo)
Procuradoria.js                 ✅ 4 funções (+ listener contínuo)
SolicitacoesVereadores.js       ✅ 4 funções (+ listener contínuo)
functions/index.js              ✅ 2 funções críticas (triggers)
realizarReclamacaoProcon.js     ✅ 2 funções
```

