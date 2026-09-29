# Firebase por projeto Vercel

Cada Câmara deve ter um projeto Firebase próprio e um projeto Vercel próprio.
O código do portal lê a configuração do Firebase em `src/firebase.js`; os
serviços HTTP do Firebase usam o `projectId` configurado nessa mesma origem.
Assim, o mesmo código pode ser publicado para várias Câmaras sem apontar para
o Firebase de outra instalação.

## Configurar o Vercel

No painel do Vercel, abra o projeto da Câmara e acesse **Settings → Environment
Variables**. Cadastre as variáveis abaixo para **Production**, **Preview** e
**Development**, conforme os ambientes que esse projeto usar:

| Variável | Valor no Firebase Console |
| --- | --- |
| `REACT_APP_FIREBASE_API_KEY` | API key do app Web |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `REACT_APP_FIREBASE_DATABASE_URL` | URL do Realtime Database, se usado |
| `REACT_APP_FIREBASE_PROJECT_ID` | ID do projeto Firebase desta Câmara |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `REACT_APP_FIREBASE_APP_ID` | App ID do app Web |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | Measurement ID, se usado |
| `REACT_APP_FIREBASE_FUNCTIONS_REGION` | Região padrão das Cloud Functions (`us-central1` por padrão) |
| `REACT_APP_FIREBASE_YOUTUBE_FUNCTIONS_REGION` | Região das Functions da TV Câmara (`southamerica-east1` por padrão) |

Os valores de configuração do SDK Web são identificadores públicos e ficam
embutidos no bundle do navegador durante a compilação. Não coloque service
account JSON, tokens, senhas SMTP, chaves privadas ou outros segredos em
variáveis `REACT_APP_*`. Segredos de backend pertencem ao Secret Manager ou à
configuração de secrets das Cloud Functions de cada projeto.

Depois de salvar ou alterar as variáveis, faça um novo deployment no Vercel.
Alterar uma variável não modifica um bundle já publicado. Em desenvolvimento
local, copie `.env.example` para `.env.local`, preencha os valores e reinicie
`npm start`.

## Manter os projetos Firebase isolados

1. Crie um projeto Firebase para a Câmara e registre nele o app Web.
2. Ative nesse projeto os produtos usados pela instalação: Authentication,
   Firestore, Storage, Realtime Database e Functions, conforme necessário.
3. Cadastre no Vercel da Câmara os valores do app Web desse projeto, em todos
   os ambientes de deployment necessários.
4. Confira nos logs do deployment se o build usou o `projectId` esperado.
5. Configure separadamente o Firebase CLI antes de publicar Functions, regras
   ou índices. O `.firebaserc` seleciona o destino do Firebase CLI e não é
   controlado pelas variáveis de build do Vercel. Use o projeto da Câmara
   explicitamente, por exemplo:

   ```sh
   firebase deploy --project ID_DO_FIREBASE_DA_CAMARA --only functions
   firebase deploy --project ID_DO_FIREBASE_DA_CAMARA --only firestore:rules
   firebase deploy --project ID_DO_FIREBASE_DA_CAMARA --only storage
   ```

O `.env.example` é somente um modelo sem valores. Arquivos `.env` locais são
ignorados pelo Git para que cada checkout possa manter sua configuração local.
As variáveis do Vercel são salvas no próprio projeto Vercel, portanto merges e
atualizações de código do GitHub não as substituem.
