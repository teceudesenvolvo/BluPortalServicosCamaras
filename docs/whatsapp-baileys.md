# Chatbot WhatsApp com Baileys

O portal conecta ao WhatsApp por um serviço persistente em Cloud Run que usa `@whiskeysockets/baileys`. O serviço recebe mensagens, salva conversas e mensagens no Firestore, executa as respostas automáticas e os fluxos cadastrados no painel, e envia respostas da equipe. A sessão e as chaves de autenticação Baileys ficam em coleções privadas acessadas pelo Admin SDK.

Baileys é uma integração comunitária não oficial do WhatsApp Web. Mantenha a dependência atualizada e considere as regras e os riscos da plataforma WhatsApp ao usar uma sessão.

## Publicar o bridge

Pré-requisitos: `gcloud` autenticado, API Cloud Run e Cloud Build habilitadas, e a conta de serviço do Cloud Run com permissão `roles/datastore.user` no projeto Firebase. O bridge valida tokens Firebase e só permite administradores/root do portal. O endpoint precisa aceitar tráfego público para receber chamadas do navegador; autenticação da aplicação ocorre pelo token Firebase.

Na raiz do repositório:

```sh
gcloud run deploy bluportal-whatsapp-bridge \
  --source ./whatsapp-bridge \
  --project blu-app-camara \
  --region southamerica-east1 \
  --allow-unauthenticated \
  --min 1 \
  --max 1 \
  --no-cpu-throttling \
  --set-env-vars FIREBASE_PROJECT_ID=blu-app-camara
```

`--min 1`, `--max 1` e CPU disponível fora das requisições mantêm uma única conexão Baileys persistente. Isso gera cobrança contínua de Cloud Run; confira os custos e cotas do projeto antes da publicação. O estado de autenticação é persistido no Firestore, para que a sessão possa ser restaurada após reinício. O bridge também supervisiona o socket e tenta reconectar com espera progressiva após falhas transitórias.

Essa configuração mantém o serviço disponível e recupera quedas de rede ou reinícios comuns. Nenhuma sessão não oficial pode ser garantida como conectada em qualquer circunstância: se o WhatsApp revogar o pareamento, a conta sair dos aparelhos conectados ou a sessão for encerrada (`logged_out`), será necessário parear novamente pelo QR. O botão **Desconectar sessão** encerra deliberadamente a sessão e exige novo pareamento.

## Conectar e testar

1. Publique as regras atualizadas do Firestore junto com a configuração do portal. A coleção `whatsappRuntime/session` é visível apenas para administradores; credenciais privadas não são expostas pelas regras.
2. Copie a URL HTTPS do serviço Cloud Run para **Administração → Chatbot WhatsApp → Configuração → URL do serviço Baileys** e salve.
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

Em **Administração → Chatbot WhatsApp → Fluxograma de atendimento**, crie ou edite um fluxo, mantenha-o ativo e adicione etapas. Cada etapa tem a mensagem que será enviada e opções de resposta; para cada opção, selecione a próxima etapa ou **Encerrar fluxo**. Se a pessoa responder com o número da opção (por exemplo, `1`) ou com o texto cadastrado, o bridge envia a mensagem da próxima etapa. Respostas que não correspondem a uma opção repetem a pergunta atual. O estado da etapa fica salvo por conversa no Firestore.

Depois de salvar o fluxo, habilite **Ativar chatbot** em Configuração. Para validar, envie uma nova mensagem de um contato sem fluxo em andamento, responda às opções e acompanhe a conversa no painel. Mensagens automáticas com gatilho são verificadas antes de iniciar um novo fluxo em conversas já existentes.
