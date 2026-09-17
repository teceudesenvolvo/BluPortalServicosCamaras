# Protocolo e Processo Administrativo Eletrônico

Cada instalação é uma Câmara independente. Este módulo não contém `tenantId`, coleção `tenants`, seleção de Câmara ou filtros entre Câmaras.

## Dados

- `processTypes`: tipos configuráveis, campos do FormBuilder, documentos obrigatórios, fluxo e prazo padrão.
- `processFlows`: etapas configuráveis por tipo, responsável, prazo e transições permitidas.
- `protocolSettings/default`: padrão de numeração e parâmetros institucionais.
- `processCounters/{year}`: contador anual atualizado somente pela Cloud Function.
- `processes/{processId}`: processo com origem, interessado, estado, acesso, prazo e responsável atual.
- `processes/{processId}/movements`, `documents`, `dispatches`, `pendingItems`, `signatures`, `timeline`, `auditLogs`, `relationships`: histórico imutável e metadados do processo.

## Segurança

O cidadão acessa apenas processos cujo `requesterId` seja o próprio UID e eventos/documentos públicos. Processos restritos e sigilosos são atendidos por Cloud Functions, que aplicam perfil, permissões, setor e vínculo de gabinete. Arquivos residem em `processes/{processId}/...` no Storage e têm metadados e nível de acesso no Firestore.

## Serviços

`ProcessEngine` é a fachada do cliente para `criarProcesso`, tramitar, anexar documento, despachar, solicitar e responder pendências, concluir, arquivar, reabrir e registrar evento. Todas as mutações chamam `processCommand`, evitando numeração e auditoria no cliente.

## Próximas entregas

O MVP inclui tipos, abertura digital/presencial, numeração transacional, anexos, caixa de entrada, tramitação, timeline, notificações e auditoria. As etapas seguintes ampliam fluxos, SLA, documentos gerados, assinaturas, pendências, arquivamento, IA e adapters externos.
