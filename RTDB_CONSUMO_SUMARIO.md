# 🔍 Consumo do Firebase Realtime Database - Sumário Executivo

## 📊 Visão Geral em Números

```
Total de arquivos JS do projeto:        50 arquivos
Arquivos usando Realtime Database:      20 arquivos (40%)
Arquivos usando Firestore:              12 arquivos (24%)
Percentual de cobertura RTDB:           █████████░░░░░░░░░░ 40%
```

---

## 📂 Mapeamento de Consumo

### Por Categoria de Funcionalidade

```
ADMIN (Painéis de Administração)
├── AdminProcon.js              🔴 CRÍTICO   (CRUD completo + listeners)
├── AdminProcuradoria.js        🔴 CRÍTICO   (CRUD completo + listeners)
├── AdminJuridico.js            🔴 CRÍTICO   (CRUD completo + listeners)
├── AdminVereadores.js          🟠 ALTO      (CRUD de vereadores)
├── AdminPiel.js                🟠 ALTO      (CRUD de PIEL)
└── AdminMigration.js           🟡 MÉDIO     (Apenas leitura para migração)

CRIAÇÃO DE DENÚNCIAS/SOLICITAÇÕES
├── realizarReclamacaoProcon.js 🔴 CRÍTICO   (Recebe novas denúncias)
├── NovoAtendimentoJuridico.js  🔴 CRÍTICO   (Recebe novos atendimentos)
├── NovaProcuradoria.js         🔴 CRÍTICO   (Recebe novos casos)
├── NovaSolicitacaoVereador.js  🔴 CRÍTICO   (Recebe novas solicitações)
├── ConfigurarPanico.js         🟠 ALTO      (Salva configurações pessoais)
└── NovaOuvidoria.js            🟠 ALTO      (Recebe ouvidorias)

VISUALIZAÇÃO/LISTAGEM
├── AtendimentoJuridico.js      🔴 CRÍTICO   (Listener reativo em tempo real)
├── Ouvidoria.js                🔴 CRÍTICO   (Listener reativo em tempo real)
├── Procuradoria.js             🔴 CRÍTICO   (Listener reativo em tempo real)
├── SolicitacoesVereadores.js   🔴 CRÍTICO   (Listener reativo em tempo real)
├── ProconAtendimentos.js       🟠 ALTO      (Leitura com query)
└── Painel.js                   🟡 MÉDIO     (Apenas leitura)

COMPONENTES
└── VereadoresSlider.js         🟡 MÉDIO     (Apenas leitura)

CLOUD FUNCTIONS
└── functions/index.js          🔴 CRÍTICO   (Triggers + agendamento)

CONFIGURAÇÃO
└── src/firebase.js             🔴 CRÍTICO   (Inicializa instância)
```

---

## 🎯 Operações Principais por Tipo

### Leitura de Dados (Simples)
```javascript
✅ Usado em: Painel.js, VereadoresSlider.js, etc. (8 arquivos)
const userRef = ref(db, `${city}/users/${userId}`);
const snapshot = await get(userRef);
```

### Query com Filtros
```javascript
✅ Usado em: AtendimentoJuridico.js, SolicitacoesVereadores.js, etc. (7 arquivos)
const q = query(ref(db, path), orderByChild('userId'), equalTo(userId));
const snapshot = await get(q);
```

### Listeners em Tempo Real
```javascript
✅ Usado em: 7 arquivos de visualização
onValue(q, (snapshot) => {
    setData(snapshot.val() ? Object.values(snapshot.val()) : []);
});
```

### Criação de Registros
```javascript
✅ Usado em: 6 arquivos de criação
const newRef = push(ref(db, `${city}/modulo`));
await set(newRef, { ...dados, createdAt: serverTimestamp() });
```

### Atualização de Registros
```javascript
✅ Usado em: AdminProcon.js, AdminProcuradoria.js, AdminJuridico.js
await update(denunciaRef, { status: newStatus, updatedAt: Date.now() });
```

### Cloud Functions Triggers
```javascript
✅ Usado em: functions/index.js
exports.sendMailOnNewRequest = onValueCreated(
    { ref: "/{city}/mail/{pushId}" },
    async (event) => { ... }
);
```

---

## 📊 Estrutura de Dados Crítica no RTDB

```json
{
  "paraipaba": {
    "users": {
      "uid1": {
        "name": "João Silva",
        "email": "joao@email.com",
        "phone": "+55 85 99999-9999",
        "address": "Rua X, 123",
        "tipo": "Cidadão"
      }
    },
    "denuncias-procon": {
      "id1": {
        "protocolo": "1234567890",
        "userId": "uid1",
        "companyName": "Empresa X",
        "status": "Em Análise",
        "createdAt": "2026-04-19T10:30:00Z",
        "arquivos": [
          { "name": "documento.pdf", "url": "gs://..." }
        ],
        "messages": {
          "msg1": {
            "text": "Nova resposta",
            "sender": "admin",
            "timestamp": 1234567890
          }
        }
      }
    },
    "atendimento-juridico": { /* similar */ },
    "procuradoria-mulher": { /* similar */ },
    "solicitacoes-vereadores": { /* similar */ },
    "ouvidoria": { /* similar */ },
    "notifications": {
      "notif1": {
        "targetUserId": "uid1",
        "tituloNotification": "Status atualizado",
        "timestamp": 1234567890
      }
    },
    "vereadores": { /* dados dos vereadores */ },
    "piel": { /* dados PIEL */ },
    "balcao-config": {
      "availability": { /* config de agendamento */ },
      "bookedSlots": {
        "2026-04-25": {
          "10:00": true,
          "10:30": true
        }
      }
    },
    "mail": {
      "pushId1": {
        "to": "user@email.com",
        "message": { "subject": "...", "html": "..." }
      }
    }
  }
}
```

---

## 🔄 Fluxos Principais do Sistema

### 1️⃣ Fluxo de Denúncia PROCON
```
User (realizarReclamacaoProcon.js)
  ├─ Busca perfil em: {city}/users/{userId}   ✅ GET
  ├─ Faz upload de arquivos → Storage
  └─ Salva denúncia em: {city}/denuncias-procon   ✅ PUSH + SET

Admin (AdminProcon.js)
  ├─ Lê todas denúncias: {city}/denuncias-procon  ✅ QUERY + GET
  ├─ Muda status: {city}/denuncias-procon/{id}   ✅ UPDATE
  ├─ Envia mensagem: {city}/denuncias-procon/{id}/messages  ✅ PUSH + SET
  └─ Cria notificação: {city}/notifications   ✅ PUSH + SET

Cloud Functions
  └─ Processa mail: {city}/mail + remove após envio  ✅ TRIGGER + REMOVE
```

### 2️⃣ Fluxo de Atendimento Jurídico
```
User (NovoAtendimentoJuridico.js)
  ├─ Busca perfil: {city}/users/{userId}   ✅ GET
  └─ Salva atendimento: {city}/atendimento-juridico   ✅ PUSH + SET

User Visualization (AtendimentoJuridico.js)
  ├─ Busca perfil: {city}/users/{userId}   ✅ GET
  └─ Listagem com listener: {city}/atendimento-juridico   ✅ onValue (REATIVO)

Admin (AdminJuridico.js)
  ├─ Lê todos atendimentos   ✅ QUERY + GET
  ├─ Atualiza status         ✅ UPDATE
  └─ Envia mensagens         ✅ PUSH + SET
```

---

## 📈 Impacto por Operação

| Operação | Frequência | Arquivos | Impacto |
|----------|-----------|----------|---------|
| `get()` | ALTA | 12 | ✅ Fácil migrar |
| `query()` + `equalTo()` | ALTA | 7 | ✅ Mapeável para Firestore |
| `onValue()` listener | ALTA | 7 | ⚠️ Converter para `onSnapshot()` |
| `push()` + `set()` | MÉDIA | 6 | ✅ Direto para `addDoc()` |
| `update()` | MÉDIA | 5 | ✅ Direto para `updateDoc()` |
| `remove()` | BAIXA | 2 | ✅ Direto para `deleteDoc()` |
| `serverTimestamp()` | ALTA | 8 | ✅ Mesmo em Firestore |

---

## ⚙️ Arquivo de Configuração Central

### [src/firebase.js](src/firebase.js) - NÃO REMOVER
```javascript
export const auth = getAuth(app);
export const db = getDatabase(app);        // 👈 REALTIME DATABASE
export const firestore = initializeFirestore(app, {...});
export const storage = getStorage(app);
```

**Impacto**: 19 arquivos importam `db` daqui.
**Mudança necessária**: Quando migrar, remover `getDatabase()` e refs ao `db`.

---

## 🚨 Riscos de Não Migrar

```
CUSTOS 💰
├─ RTDB: $1/GB armazenado + $1/GB baixado
├─ Firestore: $0.06 por 100k leituras + $0.18 por 100k escritas
└─ Resultado: DOBRO de custos mantendo ambos

COMPLEXIDADE 📚
├─ 2 SDKs para manter
├─ 2 padrões de query diferentes
├─ Sincronização manual necessária
└─ Documentação duplicada

PERFORMANCE ⚡
├─ Firestore melhor para queries complexas
├─ Realtime DB melhor para dados simples/aninhados
├─ Mas ambos ativos = confusão de dados

MANUTENÇÃO 🔧
├─ Updates precisam ser feitos em ambos
├─ Testes em duplicate
├─ Possibilidade de desincronização
```

---

## ✅ Checklist de Migração Recomendado

### ANTES (Hoje)
- [ ] Análise completa ✅ **FEITA**
- [ ] Backup do RTDB
- [ ] Criar schema no Firestore

### DURANTE
- [ ] Converter `ref()` para `doc()`
- [ ] Converter `query()` para `query()` do Firestore
- [ ] Converter `get()` para `getDoc()` ou `getDocs()`
- [ ] Converter `set()` / `push()` para `setDoc()` / `addDoc()`
- [ ] Converter `update()` para `updateDoc()`
- [ ] Converter `remove()` para `deleteDoc()`
- [ ] Converter `onValue()` para `onSnapshot()`
- [ ] Atualizar Cloud Functions

### DEPOIS
- [ ] Testar todos 20 módulos
- [ ] Comparar performance
- [ ] Manter RTDB como backup por 30 dias
- [ ] Desabilitar gradualmente

---

## 📞 Contato para Dúvidas

Para mais detalhes sobre qualquer módulo específico, ver:
👉 **[REALTIME_DATABASE_USAGE_ANALYSIS.md](REALTIME_DATABASE_USAGE_ANALYSIS.md)** - Análise técnica completa

