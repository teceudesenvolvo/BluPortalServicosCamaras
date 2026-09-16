# Arquitetura de videoconferência Câmara AI

## Auditoria e reaproveitamento

O Portal usa Firebase Authentication, Firestore, Storage, Realtime Database, permissões de perfil, `camaraId`, usuários e o módulo Legislativo. O eCamara contém a referência de produto para plenário: `SessaoPlenariaRestrita`, `pautasSessao`, `ResumoSessao` e `VirtualMeetingPage`, além de presença, pauta, votação, fila de fala, presidência temporária e geração de minuta. A implementação anterior usa `@jitsi/react-sdk` apenas em plenário, `iframe` em comissão e URLs públicas/preditíveis de `meet.jit.si`; ela não possui JWT, isolamento de tenant, gravação orquestrada ou timeline oficial.

O Portal reaproveita a regra legislativa, sessão, comissão, reunião, presença, votação, documentos, atas e Storage. A nova camada não substitui o Plenário Digital: ela fornece somente comunicação audiovisual incorporada.

## Componentes criados

- `VideoConferenceService`: fachada do frontend para criação, token, gravação, encerramento e transcrição.
- Cloud Functions `createVideoConference`, `getVideoConferenceJoinToken` e `changeVideoConferenceStatus`.
- `LegislativeVideoConference`: player Jitsi incorporado, sem domínio codificado.
- Coleções `videoconferencias`, `videoconferencia_eventos`, `legislativo_gravacoes`, `legislativo_transcricoes`, `legislativo_eventos_sessao` e `legislativo_jobs_transcricao`.

## Modelo de dados

`videoconferencias` contém `councilId`, `gabineteId`, `referenceId`, `type`, `roomId`, `provider`, status, agenda temporal, gravação, transcrição, retenção, criador e auditoria. Tipos aceitos: `PLENARY_SESSION`, `COMMISSION_MEETING`, `PUBLIC_HEARING` e `OTHER`.

Salas usam `camara-{hash-do-tenant}-{uuid}`, enquanto a interface exibe somente o título legislativo. O token JWT dura 15 minutos, é emitido pela Function após validar usuário, tenant, referência e papel. Moderador é determinado pela presidência da Câmara, presidência temporária da sessão ou presidência da comissão; administrador técnico não ganha moderação automaticamente.

## Endpoints callable

- `createVideoConference`: cria uma conferência idempotente para uma sessão ou reunião.
- `getVideoConferenceJoinToken`: emite JWT de entrada temporário.
- `changeVideoConferenceStatus`: registra pedido de gravação, término, transcrição ou encerramento. O controlador Jibri/worker consome esses estados.

As Functions de gatilho `createConferenceForRemoteSession` e `createConferenceForRemoteCommissionMeeting` criam automaticamente a conferência quando uma sessão ou reunião é cadastrada nos formatos remoto, virtual ou híbrido.

## Fluxo assíncrono futuro já preparado

1. A presidência encerra a reunião.
2. Jibri finaliza e envia o arquivo para Storage.
3. Um job idempotente registra a gravação e extrai áudio comprimido.
4. `TranscriptionService` chama o provider configurado e persiste texto e segmentos com timestamps.
5. Eventos oficiais de sessão são correlacionados aos segmentos.
6. `LegislativeMinutesService` gera **minuta**, nunca ata oficial.
7. A secretaria revisa, assina e publica.

Os dados oficiais — presença, pauta, votação, resultado e horários — devem continuar vindos do Câmara AI. A IA só resume e organiza conteúdo discursivo; não pode alterar fatos oficiais.

## Infraestrutura e deploy

Os arquivos em `infra/jitsi/` contêm Compose, variáveis, proxy Nginx e operação. Use HTTPS, TCP 80/443, UDP 10000 e IP público anunciado pelo JVB. Jibri deve ser dedicado em produção. Faça backup do diretório de configuração do Jitsi e dos metadados/arquivos no Firebase Storage; atualize imagens somente após homologação.

Para a Function, cadastre `JITSI_JWT_SECRET` via Secret Manager. Configure `JITSI_DOMAIN` e `JITSI_APP_ID` somente no ambiente backend. Para o Portal, configure somente `REACT_APP_JITSI_DOMAIN`.
