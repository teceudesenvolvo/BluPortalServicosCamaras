# Módulos administrativos

## Arquitetura da instalação

Os módulos de Fiscalização de Contratos, Almoxarifado, Patrimônio,
Manutenção Patrimonial e Frotas pertencem à instalação atual. Não há
`tenantId`, `organizationId`, `camaraId`, seletor de Câmara ou coleção para
isolamento de organizações. A identidade institucional usada nos documentos
vem de `system-control/portal`.

Cada operação de escrita passa por `administrativeCommand`, uma Cloud Function
callable. Ela valida a autenticação, o módulo ativo, a permissão granular, o
payload e grava a alteração juntamente com o evento de auditoria na mesma
transação quando a operação exigir consistência.

## Ativação

1. Acesse **Controle do Sistema > Módulos** com uma conta root.
2. Ative o painel administrativo e, quando necessário, a superfície
   **Aplicativo** para cada módulo.
3. Em **Permissões por tipo de usuário**, conceda somente as ações necessárias
   para cada papel.
4. Os módulos desativados deixam de aparecer no menu, nas rotas e nas
   integrações. Seus dados permanecem preservados.

Papéis operacionais padrão:

| Módulo | Papel padrão |
| --- | --- |
| Contratos | Fiscal de Contrato, Gestor de Contrato, Gestor de Setor |
| Almoxarifado | Almoxarifado, Gestor de Setor |
| Patrimônio | Patrimônio, Gestor de Setor |
| Manutenção | Manutenção, Gestor de Setor |
| Frotas | Frotas, Gestor de Setor |

Administradores e contas root mantêm o acesso, desde que o módulo esteja
ativado.

## Rotas

| Módulo | Painel | Operação de campo responsiva |
| --- | --- | --- |
| Contratos | `/admin/contratos` | `/operacoes/contratos` |
| Almoxarifado | `/admin/almoxarifado` | `/operacoes/almoxarifado` |
| Patrimônio | `/admin/patrimonio` | `/operacoes/patrimonio` |
| Manutenção | `/admin/manutencao` | `/operacoes/manutencao` |
| Frotas | `/admin/frotas` | `/operacoes/frotas` |
| Relatórios | `/admin-relatorios` | — |

As rotas de campo fazem parte do Portal responsivo. O repositório atual não
contém um projeto móvel nativo separado; por isso elas reutilizam os mesmos
serviços e regras do painel, sem duplicar lógica de negócio.

## Dados no Firestore

### Núcleo

- `system-control/portal`: feature flags, identidade e permissões;
- `administrativeCounters`: sequências transacionais para identificadores;
- `administrativeAuditLogs`: trilha imutável de operações;
- `administrativeExports`: histórico individual de exportações.

### Contratos

- `contracts`;
- subcoleções: `inspections`, `occurrences`, `measurements`, `obligations`.

### Almoxarifado

- `inventoryProducts`;
- `inventoryWarehouses`;
- `inventoryBatches`;
- `inventoryMovements`;
- `materialRequests`.

### Patrimônio, manutenção e frotas

- `assets`, `assetMovements`, `assetInventories`, `assetEvents`;
- `maintenanceTickets`, `maintenanceWorkOrders`, `maintenancePlans`,
  `maintenanceSchedules`;
- `fleetVehicles`, `fleetDrivers`, `fleetFuelings`, `fleetMaintenance`,
  `fleetTires`, `fleetDocuments`, `fleetIncidents`, `fleetFines`,
  `fleetEvents`.

## Identificadores

As sequências são geradas em transação no backend e não no navegador:

`CTR`, `FIS`, `OCO`, `REQ`, `OS`, `MAN`, `INV` e `PAT`, no formato
`PREFIXO-ANO-SEQUENCIAL`.

## Arquivos e documentos

Os anexos administrativos usam o caminho:

```text
administrativo/{modulo}/{entidade}/{arquivo-versionado}
```

As regras aceitam PDF, imagens, vídeo e documentos Office de até 25 MB. Um
cliente autorizado somente cria um arquivo novo; não pode substituir nem
excluir um arquivo já enviado. Para uma nova versão, gere um novo nome de
arquivo e preserve a referência anterior no registro administrativo.

## Alertas e relatórios

`administrativeDailyAlerts` executa diariamente às 08:00 em
`America/Fortaleza`. Ela cria notificações idempotentes para vencimento de
contratos, estoque mínimo, documentos de frota e manutenção preventiva.

A tela `/admin-relatorios` gera CSV e PDF institucional. Antes do download,
ela registra em `administrativeExports` e em `administrativeAuditLogs` o
usuário, módulo, tipo de relatório, formato e número de linhas exportadas.

## Publicação

Após revisar as alterações da instalação, execute:

```bash
npm --prefix functions run lint
npm run build
firebase deploy --only firestore:rules,storage,functions:administrativeCommand,functions:administrativeDailyAlerts
```

Não renomeie ou altere o tipo de gatilho de Functions já publicadas. Para uma
Function existente com outro gatilho, publique uma exportação com um nome novo
ou faça a migração planejada separadamente.

## Validação manual

### Contratos

1. Ative o módulo e cadastre um contrato com fiscal e gestor.
2. Entre como fiscal, abra **Operações de campo > Fiscalização** e registre a
   verificação.
3. Confirme a subcoleção `inspections`, o evento de auditoria e a atualização
   do contrato.

### Almoxarifado e manutenção

1. Cadastre produto, depósito e saldo inicial.
2. Envie uma requisição de material e avance os estados autorizados.
3. Abra um chamado de manutenção vinculado ao patrimônio.
4. Ao entregar material para uma ordem de serviço, confirme a movimentação de
   estoque e a auditoria antes de concluir a OS.

### Patrimônio e frotas

1. Cadastre um bem e, quando aplicável, relacione-o a um veículo.
2. Faça uma movimentação patrimonial e registre um abastecimento.
3. Confirme que a quilometragem não aceita valor inferior ao já registrado.

### Segurança

1. Tente editar diretamente uma coleção administrativa pelo cliente: a regra
   deve negar.
2. Tente sobrescrever ou apagar um arquivo em `administrativo/`: a regra deve
   negar.
3. Desative um módulo e confirme que suas rotas, ações e integrações ficam
   indisponíveis.

