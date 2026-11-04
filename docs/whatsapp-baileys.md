# Chatbot WhatsApp com Baileys

O portal conecta ao WhatsApp por um serviço persistente em Cloud Run que usa `@whiskeysockets/baileys`. O serviço recebe mensagens, salva conversas e mensagens no Firestore, executa as respostas automáticas e os fluxos cadastrados no painel, e envia respostas da equipe. A sessão e as chaves de autenticação Baileys ficam em coleções privadas acessadas pelo Admin SDK.

Baileys é uma integração comunitária não oficial do WhatsApp Web. Mantenha a dependência atualizada e considere as regras e os riscos da plataforma WhatsApp ao usar uma sessão.

## Publicar o bridge com custo reduzido

Pré-requisitos: `gcloud` autenticado e atualizado com suporte ao comando beta de instâncias do Cloud Run, acesso de implantação ao projeto e ao Artifact Registry, e a conta de serviço do Cloud Run com permissão `roles/datastore.user` no projeto Firebase. O bridge valida tokens Firebase e só permite administradores/root do portal. O endpoint precisa aceitar tráfego público para receber chamadas do navegador; autenticação da aplicação ocorre pelo token Firebase.

Atualize o Google Cloud CLI antes de começar a migração e confirme que o subcomando existe. Não exclua o serviço atual se a ajuda não abrir:

```sh
gcloud components update
gcloud beta run instances create --help
```

Para manter o Baileys conectado sem pagar por uma instância de serviço com CPU integral reservada o mês todo, use uma **instância única do Cloud Run**. Esse recurso está em prévia e usa CPU compartilhada, com capacidade de pico e limite básico de CPU; o Google informa uma estimativa de US$ 5,70/mês para 1 vCPU e 1 GiB por 30 dias, antes de diferenças regionais, rede e outros itens ([visão geral e custo](https://cloud.google.com/blog/products/serverless/introducing-cloud-run-instances)). O valor final em reais depende da região e da conta de faturamento.

O exemplo implantado para este projeto usa 1 vCPU e 512 MiB, o mínimo aceito para uma instância de 1 vCPU. A sessão e as credenciais ficam no Firestore, portanto sobrevivem às reinicializações da instância. O recurso tem ciclo de execução de até sete dias e política de reinício automático; a conexão pode ter pequenas interrupções durante reinícios e ainda pode exigir novo QR se o WhatsApp revogar o pareamento.

Reutilize a imagem que já está implantada no serviço atual. Assim, não é necessário enviar o código ao Cloud Build nem acessar o bucket de staging:

```sh
gcloud run services describe bluportal-whatsapp-bridge \
  --project blu-app-camara \
  --region southamerica-east1 \
  --format="value(spec.template.spec.containers[0].image)"
```

Copie o endereço `...@sha256:...` retornado. Como o bridge atual mantém uma conexão Baileys, não execute o serviço antigo e a instância nova ao mesmo tempo com as mesmas credenciais. A troca abaixo encerra o serviço anterior e cria a instância usando a imagem copiada; haverá uma breve interrupção:

```sh
gcloud run services delete bluportal-whatsapp-bridge \
  --project blu-app-camara \
  --region southamerica-east1

gcloud beta run instances create bluportal-whatsapp-bridge-lowcost \
  --project blu-app-camara \
  --region southamerica-east1 \
  --image COLE_AQUI_A_IMAGEM_COMPLETA_COM_SHA256 \
  --port 8080 \
  --cpu 1 \
  --memory 512Mi \
  --restart-policy always \
  --public \
  --set-env-vars FIREBASE_PROJECT_ID=blu-app-camara
```

O comando retorna uma URL HTTPS. No portal, atualize **Administração → WhatsApp Câmara → Configuração → URL do serviço** com a URL da instância e salve. Acesse a URL nova com `/health` e confirme `{"ok":true,...}`; depois confirme `connected`, envie uma mensagem de teste e confira a resposta automática.

### Ativação vinculada à abertura dos guichês

A instância do WhatsApp acompanha o funcionamento real dos guichês. Cada abertura cria uma sessão com status `Aberta` na coleção `atendimento-guiche-relatorios`; a Function `whatsappBridgeSyncWithCounterSessions` consulta se existe ao menos uma sessão aberta e inicia a instância. Ao encerrar um guichê, ela consulta as demais sessões e só para a instância quando a última for encerrada. Abrir ou fechar um guichê não interrompe atendimentos dos outros guichês.

Administradores também têm os botões **Iniciar atendimento** e **Encerrar atendimento** no topo de **WhatsApp Câmara**. Antes de iniciar, as Functions verificam se há credenciais Baileys pareadas no Firestore. Depois que a instância sobe, consultam o `/health` real do bridge; se a conexão Baileys não ficar `connected` em até 45 segundos, a instância é parada. Sem credenciais pareadas, ela não é iniciada. O botão de QR Code em **Configuração** é a ação explícita para primeiro pareamento ou reparo da sessão. O encerramento fecha todas as sessões de guichê, devolve à fila os atendimentos em chamada e para a instância. Como proteção contra esquecimento, a Function `whatsappAttendanceDailyCutoff` repete esse encerramento todos os dias às 15:00 no fuso `America/Fortaleza`, inclusive fechando guichês que tenham ficado abertos.

A Function executa em `us-central1`, usa a conta `whatsapp-bridge-scheduler@blu-app-camara.iam.gserviceaccount.com` e chama a API de ciclo de vida da instância em `southamerica-east1`. Essa conta precisa ler o Firestore e ter as permissões `run.instances.get`, `run.instances.start` e `run.instances.stop` por papel personalizado. Os antigos agendamentos de horário fixo devem ser excluídos; não se usa mais calendário de dias úteis ou feriados para controlar o WhatsApp.

Publique as três Functions com repetição de eventos habilitada (`--force` confirma essa política ao Firebase CLI):

```sh
firebase deploy --only functions:whatsappBridgeSyncWithCounterSessions,functions:whatsappAttendanceControl,functions:whatsappAttendanceDailyCutoff --project blu-app-camara --force
```

Confirme que não existem os agendamentos antigos de horário fixo e que `firebase-schedule-whatsappAttendanceDailyCutoff-us-central1` está habilitado. O controle operacional fica em `whatsappRuntime/session.instanceAvailability`; o campo `status` continua reservado à conexão Baileys (`connected`, `disconnected` etc.).

Se a criação ou a validação falhar, restaure temporariamente o serviço anterior usando a mesma imagem, sem Cloud Build, e investigue antes de tentar novamente. Substitua o marcador pela imagem completa copiada acima. A URL da instância é diferente da URL do serviço e precisa ser atualizada no portal.

```sh
gcloud run deploy bluportal-whatsapp-bridge \
  --image COLE_AQUI_A_IMAGEM_COMPLETA_COM_SHA256 \
  --project blu-app-camara \
  --region southamerica-east1 \
  --allow-unauthenticated \
  --min 1 \
  --max 1 \
  --no-cpu-throttling \
  --set-env-vars FIREBASE_PROJECT_ID=blu-app-camara
```

O bridge usa o serviço de conta padrão do Cloud Run. Garanta que a identidade da instância tenha `roles/datastore.user` no projeto `blu-app-camara`, como já é necessário para a implantação atual. A instância permanece acessível pela URL pública, mas o bridge continua validando o token Firebase e o perfil administrativo nas rotas protegidas.

### Sobre o custo

A instância única reduz bastante o custo fixo em relação ao serviço anterior com `--min 1` e `--no-cpu-throttling`. Com esse controle, ela fica ativa somente durante os atendimentos; às 15h o corte diário a desliga como redundância. O valor de US$ 5,70/mês divulgado pelo Google é uma referência para 1 vCPU e 1 GiB contínuos; o preço real da instância de 512 MiB em `southamerica-east1` depende dos SKUs aplicados. Rede, armazenamento da imagem, logs e a tarefa diária do Cloud Scheduler também podem gerar valores. A camada gratuita é compartilhada pela conta de faturamento e não garante R$ 0,00 ([preços do Cloud Run](https://cloud.google.com/run/pricing)).

Para procurar cobranças adicionais do projeto, confira no Billing os custos por SKU de Cloud Run, Cloud Build, Artifact Registry, Cloud Logging e tráfego de saída. Configure também um orçamento com alertas; orçamento alerta, mas não interrompe automaticamente a cobrança.

Se a prioridade mudar para custo zero, a alternativa é parar/excluir a instância e deixar o WhatsApp desconectado até alguém iniciá-la e parear novamente. Com Baileys, não é possível manter recebimento contínuo de mensagens com o servidor desligado.

O bridge supervisiona o socket e tenta reconectar com espera progressiva após falhas transitórias. Nenhuma sessão não oficial pode ser garantida como conectada em qualquer circunstância: se o WhatsApp revogar o pareamento, a conta sair dos aparelhos conectados ou a sessão for encerrada (`logged_out`), será necessário parear novamente pelo QR. O botão **Desconectar sessão** encerra deliberadamente a sessão e exige novo pareamento.

## Conectar e testar

1. Publique as regras atualizadas do Firestore junto com a configuração do portal. A coleção `whatsappRuntime/session` é visível apenas para administradores; credenciais privadas não são expostas pelas regras.
2. Copie a URL HTTPS do Cloud Run para **Administração → WhatsApp Câmara → Configuração → URL do serviço** e salve.
3. Clique em **Iniciar conexão / gerar QR**. No celular com a conta desejada, abra WhatsApp → **Aparelhos conectados** → **Conectar aparelho** e leia o QR exibido no portal.
4. Quando o estado mudar para `connected`, envie uma mensagem de teste de outro número. Confirme a conversa e as mensagens em **Mensagens recebidas**. Teste uma resposta manual e uma regra automática com gatilho.
5. Se o estado ficar `disconnected`, o bridge tenta recuperar a sessão automaticamente. Se ficar `logged_out`, clique em **Iniciar conexão / gerar QR**; o bridge limpa as credenciais revogadas e apresenta um novo QR Code. Mantenha o mesmo projeto e o mesmo banco Firestore para restauração após reinícios.

### Verificações rápidas

- `GET <URL_DO_CLOUD_RUN>/health` deve responder JSON com `ok: true`.
- A tela **Configuração** deve refletir `qr_required` após iniciar uma sessão nova e `connected` após ler o QR.
- Mande uma mensagem de outro telefone, confirme a conversa no painel, responda manualmente e confirme a entrega.
- Cadastre uma mensagem automática com gatilho simples, habilite o chatbot e envie novamente o texto do gatilho.
- Se a instância reiniciar, confirme no painel que a sessão volta a `connected` sem pedir novo QR.

A caixa **Ativar chatbot** controla as respostas automáticas. O recebimento e o armazenamento de mensagens e a resposta manual permanecem disponíveis com o chatbot desativado.

## Configurar um fluxo

Em **Administração → WhatsApp Câmara → Mindmap do chatbot**, crie ou edite um fluxo, mantenha-o ativo e adicione etapas. Cada etapa tem a mensagem que será enviada e opções de resposta; para cada opção, selecione a próxima etapa ou **Encerrar fluxo**. Se a pessoa responder com o número da opção (por exemplo, `1`) ou com o texto cadastrado, o bridge envia a mensagem da próxima etapa. Respostas que não correspondem a uma opção repetem a pergunta atual. O estado da etapa fica salvo por conversa no Firestore.

Depois de salvar o fluxo, habilite **Ativar chatbot** em Configuração. Para validar, envie uma nova mensagem de um contato sem fluxo em andamento, responda às opções e acompanhe a conversa no painel. Mensagens automáticas com gatilho são verificadas antes de iniciar um novo fluxo em conversas já existentes.
