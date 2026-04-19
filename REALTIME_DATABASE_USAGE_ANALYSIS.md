# Análise Completa do Consumo do Firebase Realtime Database

## Resumo Executivo
O projeto **BluPortalServicosCamaras** ainda consome extensivamente o Firebase Realtime Database (RTDB) em **20 arquivos diferentes**. A migração para Firestore está **parcialmente implementada**, mas muitos módulos ainda dependem fortemente do RTDB.

---

## 📊 Estatísticas
- **Total de arquivos JS**: 50
- **Arquivos usando RTDB**: 20 (40% do projeto)
- **Imports do RTDB**: 19 arquivos importam funções do `firebase/database`
- **Cloud Functions**: 1 arquivo (functions/index.js) usa RTDB extensivamente

---

## 📁 Detalhamento por Arquivo

### 🔴 **SEÇÃO 1: CONFIGURAÇÃO CENTRAL**

#### [src/firebase.js](src/firebase.js)
**Status**: ✅ ATIVO - Inicialização do RTDB
```javascript
import { getDatabase } from "firebase/database";
export const db = getDatabase(app);
export const firestore = initializeFirestore(app, {...});
```
- **Uso**: Inicializa a instância do Realtime Database que é exportada como `db`
- **Impacto**: Crítico - É o ponto central de acesso ao RTDB em todo o projeto
- **Dependentes**: Todos os 19 arquivos que usam `db`

---

### 🔴 **SEÇÃO 2: MÓDULOS DE ADMIN (5 arquivos)**

#### [src/pages/pagesAdmin/AdminProcon.js](src/pages/pagesAdmin/AdminProcon.js)
**Status**: ✅ ATIVO - Gerenciamento completo de denúncias
```javascript
import { ref, query, orderByKey, limitToLast, update, push, set, serverTimestamp, get } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA**: `ref()` + `query()` + `orderByKey()` + `limitToLast()` + `get()` 
  - Linha 264: Busca todas as denúncias (últimas 200)
  - Linha 41: Busca dados do usuário por userId
- ✅ **ATUALIZAÇÃO**: `update()`
  - Linha 82: Atualiza arquivos migrados para Storage
  - Linha 449: Atualiza status da denúncia
  - Linha 500: Adiciona novos arquivos à denúncia
- ✅ **CRIAÇÃO**: `push()` + `set()`
  - Linha 417-418: Cria notificações no nó `notifications`
  - Linha 461-462: Insere mensagens no thread de denúncias
- **Nós RTDB utilizados**:
  - `{city}/denuncias-procon` - Armazena todas as denúncias PROCON
  - `{city}/denuncias-procon/{id}/arquivos` - Arquivos anexados
  - `{city}/denuncias-procon/{id}/messages` - Histórico de mensagens
  - `{city}/notifications` - Notificações do sistema
  - `{city}/users/{userId}` - Dados do perfil do usuário

**Crítico**: Este é um dos módulos mais críticos do projeto, gerenciando todo o fluxo de denúncias PROCON.

---

#### [src/pages/pagesAdmin/AdminProcuradoria.js](src/pages/pagesAdmin/AdminProcuradoria.js)
**Status**: ✅ ATIVO - Gerenciamento de denúncias de Procuradoria
```javascript
import { ref, query, orderByKey, limitToLast, update, push, set, serverTimestamp, get } from 'firebase/database';
```
**Operações do RTDB**: *(Similar ao AdminProcon)*
- Leitura com `query()`, `orderByKey()`, `limitToLast()`
- Atualização com `update()`
- Criação com `push()` e `set()`

**Nós RTDB utilizados**:
- `{city}/procuradoria-mulher` - Denúncias de procuradoria
- `{city}/procuradoria-mulher/{id}/messages` - Mensagens
- `{city}/notifications` - Notificações

---

#### [src/pages/pagesAdmin/AdminJuridico.js](src/pages/pagesAdmin/AdminJuridico.js)
**Status**: ✅ ATIVO - Gerenciamento de atendimentos jurídicos
```javascript
import { ref, query, orderByKey, limitToLast, update, push, set, serverTimestamp, get } from 'firebase/database';
```
**Operações do RTDB**: *(Similar ao AdminProcon)*

**Nós RTDB utilizados**:
- `{city}/atendimento-juridico` - Atendimentos jurídicos
- `{city}/atendimento-juridico/{id}/messages` - Mensagens
- `{city}/notifications` - Notificações

---

#### [src/pages/pagesAdmin/AdminVereadores.js](src/pages/pagesAdmin/AdminVereadores.js)
**Status**: ✅ ATIVO - Gerenciamento de solicitações para vereadores
```javascript
import { ref, get, push, update, remove } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA**: `ref()` + `get()`
- ✅ **CRIAÇÃO**: `push()`
- ✅ **ATUALIZAÇÃO**: `update()`
- ✅ **DELEÇÃO**: `remove()`

**Nós RTDB utilizados**:
- `{city}/solicitacoes-vereadores` - Solicitações para vereadores
- `{city}/vereadores` - Dados dos vereadores (CRUD completo)

---

#### [src/pages/pagesAdmin/AdminPiel.js](src/pages/pagesAdmin/AdminPiel.js)
**Status**: ✅ ATIVO - Gerenciamento de PIEL
```javascript
import { ref, get, update, push, remove, serverTimestamp } from 'firebase/database';
```
**Operações do RTDB**: *(CRUD Completo)*

**Nós RTDB utilizados**:
- `{city}/piel` - Dados do PIEL
- Operações de leitura, criação, atualização e deleção

---

#### [src/pages/pagesAdmin/AdminMigration.js](src/pages/pagesAdmin/AdminMigration.js)
**Status**: ✅ ATIVO - Ferramentas de migração (RTDB → Firestore)
```javascript
import { ref, get } from 'firebase/database';
```
**Operações do RTDB**:
- Leitura de dados para migração

**Propósito**: Verificar e gerenciar migração de dados

---

### 🔴 **SEÇÃO 3: MÓDULOS DE USUÁRIO - CRIAÇÃO/ENVIO (6 arquivos)**

#### [src/pages/pagesUser/realizarReclamacaoProcon.js](src/pages/pagesUser/realizarReclamacaoProcon.js)
**Status**: ✅ ATIVO - Formulário de reclamação PROCON
```javascript
import { ref, push, get } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA**: Linha 73 - `ref()` + `get()` para buscar dados do usuário
- ✅ **CRIAÇÃO**: Linha 269 - `ref()` + `push()` para inserir nova reclamação

**Fluxo**:
1. Usuário acessa o formulário
2. Sistema busca dados do perfil em `{city}/users/{userId}`
3. Usuário preenche e envia: dados salvos em `{city}/denuncias-procon`
4. Arquivos vão para Storage (Firebase Storage - já migrado)

**Nós RTDB utilizados**:
- `{city}/users/{userId}` - Leitura do perfil
- `{city}/denuncias-procon` - Criação de nova denúncia

---

#### [src/pages/pagesUser/NovoAtendimentoJuridico.js](src/pages/pagesUser/NovoAtendimentoJuridico.js)
**Status**: ✅ ATIVO - Formulário de novo atendimento jurídico
```javascript
import { ref, get, push, set, serverTimestamp } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA**: Linha 50 - Busca dados do usuário
- ✅ **CRIAÇÃO**: Linha 113, 116 - Insere novo atendimento jurídico

**Nós RTDB utilizados**:
- `{city}/users/{userId}` - Leitura
- `{city}/atendimento-juridico` - Criação

---

#### [src/pages/pagesUser/NovaProcuradoria.js](src/pages/pagesUser/NovaProcuradoria.js)
**Status**: ✅ ATIVO - Formulário de denúncia de procuradoria
```javascript
import { ref, get, push, set, serverTimestamp } from 'firebase/database';
```
**Similar ao NovoAtendimentoJuridico**

**Nós RTDB utilizados**:
- `{city}/users/{userId}` - Leitura
- `{city}/procuradoria-mulher` - Criação

---

#### [src/pages/pagesUser/NovaSolicitacaoVereador.js](src/pages/pagesUser/NovaSolicitacaoVereador.js)
**Status**: ✅ ATIVO - Formulário de solicitação para vereador
```javascript
import { ref, get, push, set, serverTimestamp, query, orderByChild, equalTo } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA**: Busca dados do usuário e executa queries
- ✅ **CRIAÇÃO**: Insere nova solicitação
- **Query avançada**: `orderByChild()` + `equalTo()` para filtros

**Nós RTDB utilizados**:
- `{city}/users/{userId}` - Leitura
- `{city}/solicitacoes-vereadores` - Criação/Query

---

#### [src/pages/pagesUser/ConfigurarPanico.js](src/pages/pagesUser/ConfigurarPanico.js)
**Status**: ✅ ATIVO - Configuração do botão de pânico para mulheres
```javascript
import { ref, get, set } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA**: Busca contatos de emergência
- ✅ **ATUALIZAÇÃO**: Salva novas configurações

**Nós RTDB utilizados**:
- `{city}/procuradoria-mulher-btn-panico/{userId}` - Configurações pessoais
- `{city}/users/{userId}` - Perfil

---

#### [src/pages/pagesUser/NovaOuvidoria.js](src/pages/pagesUser/NovaOuvidoria.js)
**Status**: ✅ ATIVO - Formulário de ouvidoria
```javascript
// Importações não encontradas no grep, mas referências a push() indicam uso
```

---

### 🔴 **SEÇÃO 4: MÓDULOS DE USUÁRIO - VISUALIZAÇÃO/LISTAGEM (7 arquivos)**

#### [src/pages/pagesUser/AtendimentoJuridico.js](src/pages/pagesUser/AtendimentoJuridico.js)
**Status**: ✅ ATIVO - Listagem de atendimentos jurídicos
```javascript
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA REATIVA**: Linha 72-75 - `onValue()` listener em tempo real
  - Query com `orderByChild()` + `equalTo()` para filtrar por usuário
  - Atualiza automaticamente quando há mudanças

**Nós RTDB utilizados**:
- `{city}/atendimento-juridico` - Com listener reativo

---

#### [src/pages/pagesUser/Ouvidoria.js](src/pages/pagesUser/Ouvidoria.js)
**Status**: ✅ ATIVO - Listagem de ouvidorias
```javascript
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database';
```
**Similar ao AtendimentoJuridico** com listener `onValue()`

**Nós RTDB utilizados**:
- `{city}/ouvidoria` - Com listener reativo

---

#### [src/pages/pagesUser/Procuradoria.js](src/pages/pagesUser/Procuradoria.js)
**Status**: ✅ ATIVO - Listagem de procuradorias
```javascript
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database';
```
**Similar aos anteriores**

**Nós RTDB utilizados**:
- `{city}/procuradoria-mulher` - Com listener reativo
- `{city}/procuradoria-mulher-btn-panico/{userId}` - Configurações

---

#### [src/pages/pagesUser/SolicitacoesVereadores.js](src/pages/pagesUser/SolicitacoesVereadores.js)
**Status**: ✅ ATIVO - Listagem de solicitações para vereadores
```javascript
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database';
```
**Similar aos anteriores**

**Nós RTDB utilizados**:
- `{city}/solicitacoes-vereadores` - Com listener reativo

---

#### [src/pages/pagesUser/Painel.js](src/pages/pagesUser/Painel.js)
**Status**: ✅ ATIVO - Dashboard do usuário
```javascript
import { ref, get } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA**: Busca dados do perfil do usuário

**Nós RTDB utilizados**:
- `{city}/users/{userId}` - Perfil do usuário

---

#### [src/pages/pagesUser/ProconAtendimentos.js](src/pages/pagesUser/ProconAtendimentos.js)
**Status**: ✅ ATIVO - Visualização de atendimentos PROCON
```javascript
import { getDatabase, ref, query, orderByChild, equalTo, get } from 'firebase/database';
```
**Operações do RTDB**:
- ✅ **LEITURA**: Query com filtros

**Nós RTDB utilizados**:
- `{city}/denuncias-procon` - Com filtros por usuário

---

### 🟡 **SEÇÃO 5: COMPONENTES REUTILIZÁVEIS (2 arquivos)**

#### [src/components/VereadoresSlider.js](src/components/VereadoresSlider.js)
**Status**: ✅ ATIVO - Slider de vereadores
```javascript
import { ref, get } from 'firebase/database';
```
**Operações do RTDB**:
- Busca lista de vereadores para exibição

**Nós RTDB utilizados**:
- `{city}/vereadores` - Dados dos vereadores

---

### 🔵 **SEÇÃO 6: CLOUD FUNCTIONS (1 arquivo)**

#### [functions/index.js](functions/index.js)
**Status**: ✅ ATIVO - Cloud Functions com múltiplas operações
```javascript
const admin = require("firebase-admin");
// Usa admin.database() implicitamente
```
**Operações do RTDB**:
- ✅ **Trigger**: `onValueCreated()` em `/{city}/mail/{pushId}`
  - Monitora criação de novos e-mails para envio automático
  - Remove registro após envio bem-sucedido
- ✅ **DELEÇÃO AGENDADA**: `onSchedule()` que limpa solicitações expiradas
  - Remove registros antigos do RTDB
  - Limpa slots de agendamento em `balcao-config/bookedSlots`

**Linhas específicas**:
- Linha 1: Import de `onValueCreated` para triggers RTDB
- Linha 57: `snapshot.ref.remove()` - Remove registro de e-mail após envio
- Linha 120: `snapshot.ref.root.child(slotPath).remove()` - Remove slots de agendamento
- Linha 124: `snapshot.ref.remove()` - Remove solicitação expirada

**Nós RTDB utilizados**:
- `{city}/mail` - Fila de e-mails para envio
- `{city}/balcao-config/bookedSlots` - Slots de agendamento
- Qualquer nó de solicitação que expire

---

## 📋 Resumo de Nós RTDB Mapeados

```
{city}/
├── users/
│   └── {userId}/
│       ├── name
│       ├── email
│       ├── phone
│       ├── address
│       └── ... (perfil completo)
├── denuncias-procon/
│   └── {id}/
│       ├── arquivos/
│       └── messages/
├── atendimento-juridico/
│   └── {id}/
│       └── messages/
├── procuradoria-mulher/
│   └── {id}/
├── procuradoria-mulher-btn-panico/
│   └── {userId}/
├── solicitacoes-vereadores/
│   └── {id}/
├── ouvidoria/
│   └── {id}/
├── vereadores/
│   └── {id}/
├── piel/
│   └── {id}/
├── notifications/
│   └── {id}/
├── mail/ (Cloud Functions)
│   └── {pushId}/
└── balcao-config/
    ├── availability/
    ├── bookedSlots/
    │   └── {date}/{time}/
    └── blockedDates/
```

---

## 🔄 Padrões de Uso Identificados

### 1. **Padrão de Leitura Simples** *(Usado em 8 arquivos)*
```javascript
const userRef = ref(db, `${config.cityCollection}/users/${userId}`);
const snapshot = await get(userRef);
const userData = snapshot.val();
```
**Arquivos**: Painel.js, VereadoresSlider.js, AdminMigration.js, etc.

### 2. **Padrão de Query com Filtros** *(Usado em 7 arquivos)*
```javascript
const q = query(ref(db, `${city}/atendimento-juridico`),
    orderByChild('userId'),
    equalTo(userId)
);
const snapshot = await get(q);
```
**Arquivos**: AtendimentoJuridico.js, SolicitacoesVereadores.js, Ouvidoria.js, etc.

### 3. **Padrão de Listener Reativo** *(Usado em 7 arquivos)*
```javascript
onValue(q, (snapshot) => {
    const data = snapshot.val();
    setRecords(data ? Object.values(data) : []);
});
```
**Arquivos**: Todos os módulos de visualização/listagem

### 4. **Padrão de Criação (Push + Set)** *(Usado em 6 arquivos)*
```javascript
const novaSolicitacao = push(ref(db, `${city}/atendimento-juridico`));
await set(novaSolicitacao, {
    userId: userId,
    createdAt: serverTimestamp(),
    ...dados
});
```
**Arquivos**: NovoAtendimentoJuridico.js, NovaProcuradoria.js, etc.

### 5. **Padrão de Atualização Condicional** *(Usado em 3 arquivos)*
```javascript
const denunciaRef = ref(db, `${city}/denuncias-procon/${id}`);
await update(denunciaRef, {
    status: newStatus,
    deletionTimestamp: Date.now() + 5 * 24 * 60 * 60 * 1000
});
```
**Arquivos**: AdminProcon.js, AdminProcuradoria.js, AdminJuridico.js

### 6. **Padrão de Deleção em Cascade** *(Cloud Functions)*
```javascript
promises.push(snapshot.ref.root.child(slotPath).remove());
promises.push(snapshot.ref.remove());
```

---

## ⚠️ Impacto de Mudanças

### Se Mantiver RTDB Indefinidamente:
- ❌ Custos dobrados (RTDB + Firestore)
- ❌ Sincronização manual de dados necessária
- ❌ Código duplicado (imports de dois bancos)
- ✅ Risco zero de migração

### Se Migrar Completamente:
- ✅ Custos reduzidos
- ✅ Código simplificado
- ✅ Schema mais flexível
- ❌ Requer refatoração de 20 arquivos

---

## 🎯 Recomendações de Migração

### **Fase 1: Preparação** (SEMANA 1)
1. Fazer backup completo do RTDB
2. Criar schema no Firestore idêntico ao RTDB
3. Scripts de migração de dados
4. Testes de integridade de dados

### **Fase 2: Migração por Módulo** (SEMANAS 2-4)
**Prioridade Alta**:
- AdminProcon.js
- AdminProcuradoria.js
- AdminJuridico.js

**Prioridade Média**:
- Módulos de criação (NovoAtendimento*.js)
- Módulos de visualização (AtendimentoJuridico.js, etc.)

**Prioridade Baixa**:
- AdminVereadores.js, AdminPiel.js
- Cloud Functions

### **Fase 3: Validação** (SEMANA 5)
1. Testes completos de funcionalidade
2. Performance comparativa
3. Backup mantido por 30 dias
4. Desabilitação gradual de RTDB

---

## 📞 Próximos Passos

Para executar a migração completa, considere:
1. ✅ Refatorar imports de `firebase/database` para `firebase/firestore`
2. ✅ Converter queries RTDB para queries Firestore
3. ✅ Implementar listeners Firestore com `onSnapshot()`
4. ✅ Testar transações Firestore
5. ✅ Atualizar Cloud Functions para usar Firestore

