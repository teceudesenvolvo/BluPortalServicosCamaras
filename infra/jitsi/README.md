# Videoconferência Câmara AI

Esta infraestrutura hospeda o Jitsi Meet compartilhado por várias Câmaras. O isolamento é feito pela aplicação: cada conferência guarda `councilId`, `referenceId`, tipo e uma sala técnica aleatória. O Jitsi recebe apenas JWT temporário emitido pelas Cloud Functions; não recebe credenciais do Portal.

## Implantação inicial

1. Crie o DNS `meet.seu-dominio.gov.br` apontando para o IP público do servidor.
2. Copie `.env.example` para `.env`, preencha IP público, domínio e um segredo aleatório. Não versione `.env`.
3. Libere TCP 80/443 para o proxy e UDP 10000 para o JVB. Em NAT, configure `DOCKER_HOST_ADDRESS` e `JVB_ADVERTISE_IPS` com o IP público.
4. Configure HTTPS no Nginx de borda, usando o exemplo em `nginx/meet.conf`.
5. Execute `docker compose up -d` neste diretório e confirme `docker compose ps`.
6. Configure a Function com `firebase functions:secrets:set JITSI_JWT_SECRET` e configure `JITSI_APP_ID=camara-ai`, `JITSI_DOMAIN=meet.seu-dominio.gov.br` no ambiente das Functions. No Portal, use somente `REACT_APP_JITSI_DOMAIN=meet.seu-dominio.gov.br`.

## Gravação e transcrição

Jibri não deve compartilhar um servidor pequeno com Prosody, Jicofo e JVB. Em produção, adicione um ou mais nós Jibri dedicados, com volume temporário local e envio final para Storage. A aplicação registra gravação e transcrição separadamente, permitindo reprocessar uma etapa sem perder a anterior.

Para transcrição, use um worker assíncrono: gravação pronta → extração/compressão de áudio → provider → segmentos → minuta. O worker deve usar uma fila idempotente baseada em `conferenceId` e nunca manter uma requisição HTTP aberta durante a transcrição.

## Operação

- Health checks: web, Prosody, Jicofo, JVB, Jibri, disco, CPU, RAM e conectividade UDP.
- Backup diário: `${CONFIG}` e o banco/Storage de metadados. Teste restauração trimestralmente.
- Atualização: faça backup, fixe e teste uma nova imagem em homologação, depois execute `docker compose pull && docker compose up -d`.
- Recuperação: recupere configuração, reinicie serviços e reprocese gravações/transcrições pendentes a partir dos metadados no Firebase.

## Checklist de nova Câmara

1. Cadastre tenant/Câmara e membros no Portal.
2. Atribua presidência e permissões legislativas.
3. Use o mesmo domínio Jitsi; não crie outra pilha para cada Câmara.
4. Valide criação de sessão/reunião remota, token de participante e moderação contextual.
5. Valide gravação, retenção e acesso antes de ativar a publicação pública.

## Limites e segurança

Não publique a URL interna para espectadores. Transmissão pública deve usar um player/CDN próprio. Tokens expiram em 15 minutos, as salas são aleatórias e o usuário recebe moderação somente quando preside a sessão ou comissão correspondente. Registre finalidade, retenção e publicação da gravação para atender à LGPD.
