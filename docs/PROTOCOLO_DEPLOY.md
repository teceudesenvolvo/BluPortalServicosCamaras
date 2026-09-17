# Publicação das Functions de protocolo

As Functions callable `processCommand` e `publicProcessLookup` precisam aceitar
invocações HTTP no Cloud Run para que o preflight CORS chegue ao Firebase.
`processCommand` exige `request.auth` antes de acessar o banco.
`publicProcessLookup` exige número e código de consulta.

Na versão instalada do SDK, `onCall` não inclui a opção `invoker` no manifesto.
Republicar o código não corrige uma política IAM vazia de um serviço existente.
Se o preflight retornar 403, conferir a política do serviço e atribuir somente
`roles/run.invoker` a `allUsers` nesses dois serviços:

```sh
gcloud run services add-iam-policy-binding processcommand \
  --project PROJETO_DA_INSTALACAO --region us-central1 \
  --member=allUsers --role=roles/run.invoker
gcloud run services add-iam-policy-binding publicprocesslookup \
  --project PROJETO_DA_INSTALACAO --region us-central1 \
  --member=allUsers --role=roles/run.invoker
```

Não conceder papéis de banco, Storage ou administração a `allUsers`.

Validação: OPTIONS deve retornar 204 com CORS; POST sem token para
`processCommand` deve retornar JSON com `UNAUTHENTICATED` e status HTTP 401.

Antes de publicar a correção do tratamento de valores nulos:

```sh
npm --prefix functions run lint
node --test functions/processCommand.test.js
firebase deploy --project PROJETO_DA_INSTALACAO --only functions:processCommand
```
