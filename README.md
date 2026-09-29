# Blu Câmara — Portal de Serviços white-label

Plataforma administrativa e de atendimento ao cidadão para Câmaras Municipais. Este repositório é o **núcleo compartilhado**: funcionalidades e correções são desenvolvidas aqui e distribuídas às instalações por pull requests.

## Arquitetura

- **Core:** componentes, módulos, Functions e regras mantidos pela Blu Tecnologias.
- **Tenant:** identidade inicial em `tenants/<slug>/tenant.config.json`.
- **CMS:** configuração editável no documento Firestore `system-control/portal`.
- **Ambiente:** projeto Firebase configurado em variáveis de ambiente próprias de cada projeto Vercel; `.env.local` é usado somente no desenvolvimento local.
- **Secrets:** tokens e credenciais protegidos nas Cloud Functions.
- **Extensões:** código específico da instalação, separado do core.

Prioridade da configuração: padrões do core → arquivo do tenant → CMS no Firestore → variáveis e secrets do servidor.

## Requisitos

- Node.js 22 ou LTS compatível
- npm e Firebase CLI
- Projeto Firebase próprio da Câmara

## Instalação de uma nova Câmara

Em um clone novo, crie o projeto Firebase da Câmara. Para desenvolvimento local, abra `/instalacao`: o wizard lê o objeto `firebaseConfig` e gera `.env.local`. Para o site hospedado, configure as variáveis no projeto Vercel conforme a seção [Configurar o banco Firebase no Vercel](#configurar-o-banco-firebase-no-vercel).

Antes de concluir, ative no Firebase Authentication o provedor **E-mail/senha**, crie o Firestore, o Storage e o Realtime Database. Associe o diretório local ao projeto correto com `firebase use --add` e publique regras e índices usando os comandos com `--project ID_DO_FIREBASE_DA_CAMARA` abaixo. Depois informe os dados institucionais e crie o primeiro usuário root. A conta será gravada em `users` com `tipo: Admin` e seu e-mail será usado em `security.rootEmails`.

O wizard não armazena a senha do root nem credenciais administrativas. O arquivo `.env.local` deve permanecer no servidor e fora do Git; tokens de e-mail, Cloudflare, YouTube e outras integrações devem ser configurados como secrets das Cloud Functions.
- Repositório Git próprio da instalação

## Criar uma nova Câmara

```bash
git clone https://github.com/teceudesenvolvo/BluPortalServicosCamaras.git camara-municipio
cd camara-municipio
git remote rename origin platform
git remote add origin git@github.com:SUA-ORGANIZACAO/camara-municipio.git
npm install
npm run tenant:create -- \
  --slug=municipio \
  --name="Câmara Municipal de Município" \
  --shortName="Câmara de Município" \
  --city=Município \
  --state=CE \
  --rootEmail=administrador@camara.gov.br
npm run tenant:validate
```

O comando cria `tenants/municipio/tenant.config.json` e ativa a configuração pública em `public/tenant-config.json`.

## Configurar o Firebase

Para desenvolvimento local, copie `.env.example` para `.env.local` e preencha os valores do app Web Firebase desta Câmara:

```dotenv
REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=
REACT_APP_FIREBASE_DATABASE_URL=
REACT_APP_FIREBASE_MEASUREMENT_ID=
REACT_APP_FIREBASE_FUNCTIONS_REGION=us-central1
REACT_APP_FIREBASE_YOUTUBE_FUNCTIONS_REGION=southamerica-east1
```

Reinicie `npm start` depois de alterar o arquivo. `.env.local` é ignorado pelo Git e não deve ser enviado ao repositório.

### Configurar o banco Firebase no Vercel

Cada Câmara deve ter seu próprio projeto Firebase e seu próprio projeto Vercel. Para conectar o portal ao banco correto:

1. No Firebase Console da Câmara, abra **Configurações do projeto → Geral → Seus apps** e selecione o aplicativo Web. Copie os valores do objeto `firebaseConfig`.
2. No Vercel, abra o projeto daquela Câmara e acesse **Settings → Environment Variables**.
3. Cadastre as variáveis abaixo com os valores do Firebase da mesma Câmara. Selecione **Production**, **Preview** e **Development** para cada uma, conforme os ambientes que serão usados.

| Variável do Vercel | Campo Firebase |
| --- | --- |
| `REACT_APP_FIREBASE_API_KEY` | `apiKey` |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `REACT_APP_FIREBASE_DATABASE_URL` | `databaseURL` (se o Realtime Database for usado) |
| `REACT_APP_FIREBASE_PROJECT_ID` | `projectId` |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `REACT_APP_FIREBASE_APP_ID` | `appId` |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | `measurementId` (opcional) |
| `REACT_APP_FIREBASE_FUNCTIONS_REGION` | Região padrão das Functions; padrão `us-central1` |
| `REACT_APP_FIREBASE_YOUTUBE_FUNCTIONS_REGION` | Região das Functions da TV Câmara; padrão `southamerica-east1` |

4. Salve as variáveis e crie um novo deployment ou faça **Redeploy**. O Create React App incorpora as variáveis `REACT_APP_*` no bundle durante o build; deployments já publicados não mudam quando uma variável é editada.
5. Confira nos logs do build o `projectId` esperado e teste autenticação, Firestore e Storage. A configuração Firebase é resolvida centralmente em `src/firebase.js`, e os endpoints HTTP das Functions usam o mesmo `projectId`.

Os valores do Firebase Web SDK são identificadores públicos e ficam visíveis no aplicativo do navegador. Não coloque service account JSON, senhas, tokens, chaves privadas ou outros secrets nas variáveis `REACT_APP_*`. Configure secrets de backend no Secret Manager/Cloud Functions do projeto Firebase correspondente.

As variáveis do Vercel pertencem às configurações do projeto Vercel e não são alteradas por merges ou atualizações do código no GitHub. Confira [docs/firebase-vercel-clones.md](docs/firebase-vercel-clones.md) para o procedimento completo.

Em **Explorar coleções**, o sistema consulta os endpoints sem autenticação para identificar as regras efetivamente implantadas. Todas as coleções mantêm um objeto de exemplo local, sem leitura de documentos reais. Somente uma coleção confirmada como pública apresenta sua URL REST copiável; mudanças futuras nas regras são reconhecidas por **Verificar regras públicas**.

Em **Integrar APIs**, cadastre uma URL externa, indique o caminho da lista retornada e relacione cada propriedade da API a um campo interno. O teste transforma até cinco itens somente para pré-visualização e não grava documentos. APIs que exigem autenticação devem passar por uma Cloud Function intermediária com secrets no servidor.

```bash
firebase use --add
firebase deploy --project ID_DO_FIREBASE_DA_CAMARA --only firestore:rules,firestore:indexes,storage,database
firebase deploy --project ID_DO_FIREBASE_DA_CAMARA --only functions
firebase deploy --project ID_DO_FIREBASE_DA_CAMARA --only hosting
```

O `.firebaserc` controla o destino do Firebase CLI; ele é independente das variáveis de build do Vercel. Use o ID da Câmara em todos os comandos de deploy para não publicar Functions ou regras no projeto de outra instalação.

## Configurar pelo CMS

Cadastre o primeiro e-mail informado em `security.rootEmails` com o perfil `Admin`, entre com essa conta e acesse `/controle-sistema`. Na primeira gravação, esse administrador inicializa a autorização do tenant. Depois disso, a seção **Usuários root**, na aba **Geral**, permite incluir ou remover os responsáveis por todo o sistema. O CMS controla identificação institucional, módulos, cores, tipografia, logomarca, favicon, endpoints públicos, lojas de aplicativos, integrações e manutenção.

## Desenvolvimento e validação

```bash
npm start
npm test -- --watchAll=false --watchman=false
npm run tenant:validate
npm run build
cd functions && npm run lint
```

## Receber atualizações do núcleo

Configure no GitHub da Câmara:

```text
BLU_PLATFORM_UPSTREAM=teceudesenvolvo/BluPortalServicosCamaras
BLU_PLATFORM_AUTO_MERGE=true # opcional
```

O workflow `.github/workflows/sync-platform.yml` verifica atualizações semanalmente, ignora execuções sem mudanças e abre um pull request quando há uma nova versão. Com `BLU_PLATFORM_AUTO_MERGE=true`, o GitHub faz o merge depois que os checks obrigatórios passarem; habilite também **Allow auto-merge** nas configurações do repositório. A produção recebe a versão quando o pipeline de implantação do servidor for acionado por mudanças em `main`.

Essas preferências também podem ser registradas visualmente em **Controle do sistema → Atualizações**. A tela documenta o repositório, a frequência, o merge automático e o comando de deploy; as variáveis `BLU_PLATFORM_UPSTREAM` e `BLU_PLATFORM_AUTO_MERGE` continuam sendo configuradas nas definições do repositório GitHub, pois são segredos e permissões da automação.

Use tenant e CMS para trocar nome, cor, marca ou endpoint. Mudanças úteis para todas as Câmaras devem entrar neste repositório base.

## Documentação

- [Arquitetura white-label](docs/WHITE_LABEL_ARCHITECTURE.md)
- [Firebase por projeto Vercel](docs/firebase-vercel-clones.md)
- [Atualização das instalações](docs/UPDATING_INSTALLATIONS.md)
- [Versão e schema](platform.json)
