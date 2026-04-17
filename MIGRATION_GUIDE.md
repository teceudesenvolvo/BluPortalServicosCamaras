# Migração Segura do Realtime Database para Firestore

Este guia descreve como migrar dados do Firebase Realtime Database (RTDB) para o Firestore de forma segura, minimizando riscos.

## Pré-requisitos

1. **Conta de Serviço do Firebase**:
   - Acesse [Firebase Console](https://console.firebase.google.com/).
   - Vá para Configurações do Projeto > Contas de Serviço.
   - Gere uma nova chave privada (JSON) e baixe o arquivo.
   - Renomeie para `serviceAccountKey.json` e coloque na raiz do projeto (não commite no Git!).

2. **Instalar Dependências**:
   ```bash
   npm install firebase-admin
   ```

3. **Habilitar Firestore**:
   - No Firebase Console, habilite o Firestore no seu projeto.
   - Configure as regras de segurança iniciais (ex.: permitir leitura/escrita para desenvolvimento).

## Passos para Migração Segura

### 1. Backup dos Dados
- Faça um backup manual do RTDB via Firebase Console > Realtime Database > Exportar JSON.
- Ou use o script para exportar antes da migração.

### 2. Teste em Ambiente de Desenvolvimento
- Crie um projeto Firebase separado para testes.
- Execute a migração em um ambiente de staging primeiro.
- Verifique se os dados foram migrados corretamente (estrutura, tipos de dados).

### 3. Executar a Migração
- Edite `migrate-to-firestore.js`:
  - Substitua `'./path/to/serviceAccountKey.json'` pelo caminho real.
  - Substitua `'your-project-id'` pelo ID do seu projeto Firebase.
  - Substitua `'your-city-collection'` pela sua coleção da cidade (ex.: `blu-cidade`).

- Execute o script:
  ```bash
  node migrate-to-firestore.js
  ```

- Monitore o console para progresso. A migração usa batches de 500 documentos para evitar limites.

### 4. Verificar Dados
- Após migração, compare contagens e amostras de dados entre RTDB e Firestore.
- Use Firebase Console para inspecionar documentos no Firestore.

### 5. Atualizar Código da Aplicação
- Mude imports de `firebase/database` para `firebase/firestore`.
- Atualize queries (ex.: `getDocs` em vez de `get`).
- Teste funcionalidades (busca, filtros, paginação).

### 6. Migração em Produção
- Execute em horário de baixo tráfego.
- Monitore erros e performance.
- Mantenha RTDB ativo como backup por alguns dias.

### 7. Plano de Rollback
- Se houver problemas, reverta o código para usar RTDB.
- Tenha scripts para limpar Firestore se necessário.

## Limitações e Considerações
- **Estrutura de Dados**: Firestore usa documentos e subcoleções; ajuste se necessário.
- **Custos**: Firestore cobra por leituras/gravações; monitore uso.
- **Limites**: Firestore tem limites de 500 gravações por segundo; o script usa batches para mitigar.
- **Tipos de Dados**: Certifique-se de que timestamps e outros tipos sejam compatíveis.

## Suporte
Se encontrar problemas, consulte a [documentação do Firebase](https://firebase.google.com/docs/firestore/manage-data/move-data) ou peça ajuda específica.