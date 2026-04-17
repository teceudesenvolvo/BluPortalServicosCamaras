# Guia de Testes - Migração Firestore

## Teste 1: Verificar Rota da Página de Migração

### Passos:
1. Inicie a aplicação: `npm start`
2. Faça login como Admin
3. Abra o menu lateral (se em desktop, deverá ver a sidebar)
4. Procure por **"Migração Firestore"** no menu Admin
5. Clique no link

### Resultado Esperado:
- Página carrega sem erros
- Exibe:
  - Título "Migração para Firestore"
  - Botão "🚀 Iniciar Migração" 
  - Botão "✓ Verificar Migração"
  - Caixa informativa explicando que é não-destrutivo
  - Seção de logs (vazia inicialmente)

---

## Teste 2: Submeter Nova Solicitação (Dual-Write)

### Passos:
1. Acesse `/balcao/novo` (ou "Novo Balcão" no menu)
2. Preencha o formulário com dados de teste:
   - **Assunto**: "Teste de Dual-Write"
   - **Descrição**: "Testando salvar em RTDB + Firestore"
   - Preencha outros campos obrigatórios
3. Clique em "Enviar Solicitação"

### Verificação:
1. **Firestore Console**:
   - Acesse [Firebase Console](https://console.firebase.google.com/)
   - Selecione projeto
   - Firestore Database > Collection "balcao-cidadao"
   - Procure novo documento com timestamp recente
   - Verifique campo `source: "web"` e `migratedAt`

2. **RTDB Console**:
   - Realtime Database > `seu-prefixo/balcao-cidadao`
   - Procure mesmo documento

3. **Logs da Aplicação**:
   - Abra DevTools (F12)
   - Aba "Console"
   - Procure por:
     - ✅ "Solicitação salva no Realtime Database"
     - ✅ "Solicitação salva no Firestore"

### Resultado Esperado:
- ✅ Documento aparece em AMBOS os bancos
- ✅ IDs dos documentos são idênticos
- ✅ Console mostra ambas mensagens de sucesso
- ✅ Campo `source` = "web" no Firestore

---

## Teste 3: Iniciar Migração

### Pré-requisitos:
- Ter alguns dados no RTDB em `seu-prefixo/balcao-cidadao`
- Estar na página "Migração Firestore" como Admin

### Passos:
1. Clique em **"🚀 Iniciar Migração"**
2. Aguarde conclusão (pode levar minutos dependendo volume)

### O que Monitorar:
- ✅ Barra de progresso sobe (0% → 100%)
- ✅ Log exibe:
  - "🔄 Iniciando migração..."
  - "📤 Processando lote..." (pode repetir)
  - "✅ Migração concluída com sucesso!"
- ✅ Contadores mostram documentos processados

### Verificação Pós-Migração:
1. **Firebase Console**:
   - Firestore > balcao-cidadao
   - Documente deve exibir ~X docs (igual ao RTDB)
   - Abra alguns docs aleatórios
   - Verifique `source: "RTDB"` (migrados) vs `source: "web"` (novos)

2. **Verificar Log**:
   - Deve haver mensagens com ✅ de sucesso
   - Nenhuma mensagem de erro ❌

### Resultado Esperado:
- ✅ Migração completa sem erros
- ✅ Todos os documentos RTDB agora no Firestore
- ✅ Contagens RTDB ≈ Firestore (pode variar por ±1)

---

## Teste 4: Verificar Migração

### Passos:
1. Na página "Migração Firestore", clique em **"✓ Verificar Migração"**
2. Aguarde resultado

### Resultado Esperado:
Log exibe:
```
🔄 Iniciando verificação...
📊 RTDB: 50 documentos | Firestore: 50 documentos
✅ Verificação bem-sucedida! Contagens coincidem.
```

### Se Contagens Diferem:
Não é necessariamente um erro! Motivos possíveis:
- Novos documentos foram criados durante migração (pode rodar novamente)
- Documentos foram deletados durante migração
- Documentos com `deletionTimestamp` expirado

**Ação**: Executar novamente para sincronizar.

---

## Teste 5: Testar Sem Admin (Usuário Normal)

### Passos:
1. Faça logout (se necessário)
2. Faça login como usuário NORMAL (não-Admin)
3. Tente acessar `/admin-migration` na URL

### Resultado Esperado:
- ❌ Acesso negado (redireciona para home ou dashboard)
- 📝 Menu "Migração Firestore" não aparece na sidebar

---

## Teste 6: Rollback (Contingência)

### Se algo der errado:
1. **Dados RTDB estão intactos** ✅
2. Para reverter para RTDB único:
   - Desabilitar Firestore no código (comentar dual-write)
   - Manter RTDB como único source

3. **Nunca foi necessário apagar dados**

---

## Cenários de Erro e Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| "Falha ao conectar Firestore" | Firebase não configurado | Verificar firebase.js |
| Migração fica travada em X% | Falha na rede | Recarregar e tentar novamente |
| Contagens muito diferentes | Muitos novos docs criados | Executar migração novamente |
| "Permission denied" | Regras de segurança | Atualizar .rules ou testar em modo desenvolvimento |
| Dual-write retorna erro | Um dos bancos indisponível | Verificar console, diagnosticar qual DB |

---

## Checklist de Validação Final

- [ ] Página /admin-migration carrega
- [ ] Novo documento dual-write aparece em RTDB
- [ ] Novo documento dual-write aparece em Firestore
- [ ] Migração inicia e completa
- [ ] Logs mostram sucesso
- [ ] Contagens conferem em verificação
- [ ] Usuário normal não acessa página
- [ ] Build compila sem erros: `npm run build`

---

## Próximas Etapas Após Testes

1. ✅ Confirmar todos os testes
2. ⏳ Executar migração em produção
3. ⏳ Monitorar por 24-48h
4. ⏳ Atualizar AdminBalcaoSolicitacoes.js para ler do Firestore
5. ⏳ Deprecar RTDB após período de confiança

---

## Suporte

Se encontrar problemas:
1. Verifique o console do navegador (F12)
2. Verifique os logs do Firebase Console
3. Confirme que está em aba Admin do menu
4. Verifique conexão com Firebase

