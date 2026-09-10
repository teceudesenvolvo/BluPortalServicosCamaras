# Blu Câmara — Portal de Serviços white-label

Plataforma administrativa e de atendimento ao cidadão para Câmaras Municipais. Este repositório é o **núcleo compartilhado**: funcionalidades e correções são desenvolvidas aqui e distribuídas às instalações por pull requests.

## Arquitetura

- **Core:** componentes, módulos, Functions e regras mantidos pela Blu Tecnologias.
- **Tenant:** identidade inicial em `tenants/<slug>/tenant.config.json`.
- **CMS:** configuração editável no documento Firestore `system-control/portal`.
- **Ambiente:** projeto Firebase, domínios e variáveis em `.env.local`.
- **Secrets:** tokens e credenciais protegidos nas Cloud Functions.
- **Extensões:** código específico da instalação, separado do core.

Prioridade da configuração: padrões do core → arquivo do tenant → CMS no Firestore → variáveis e secrets do servidor.

## Requisitos

- Node.js 22 ou LTS compatível
- npm e Firebase CLI
- Projeto Firebase próprio da Câmara
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

O comando cria `tenants/municipio/tenant.config.json` e ativa a configuração em `public/tenant.config.json`.

## Configurar o Firebase

Crie `.env.local`:

```dotenv
REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=
REACT_APP_FIREBASE_DATABASE_URL=
REACT_APP_FUNCTIONS_BASE_URL=
```

Chaves privadas e tokens OAuth devem ser configurados no Firebase/Google Secret Manager.

Depois que a primeira instalação estiver conectada, a aba **Controle do sistema → Coleções → Configurar Firebase** oferece um assistente para importar o objeto `firebaseConfig`, revisar os serviços e gerar o `.env.local` de novas instalações. O assistente nunca recebe contas de serviço, chaves privadas ou secrets.

Em **Explorar coleções**, o sistema consulta os endpoints sem autenticação para identificar as regras efetivamente implantadas. Todas as coleções mantêm um objeto de exemplo local, sem leitura de documentos reais. Somente uma coleção confirmada como pública apresenta sua URL REST copiável; mudanças futuras nas regras são reconhecidas por **Verificar regras públicas**.

Em **Integrar APIs**, cadastre uma URL externa, indique o caminho da lista retornada e relacione cada propriedade da API a um campo interno. O teste transforma até cinco itens somente para pré-visualização e não grava documentos. APIs que exigem autenticação devem passar por uma Cloud Function intermediária com secrets no servidor.

```bash
firebase use --add
firebase deploy --only firestore:rules,storage
firebase deploy --only functions
firebase deploy --only hosting
```

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

Use tenant e CMS para trocar nome, cor, marca ou endpoint. Mudanças úteis para todas as Câmaras devem entrar neste repositório base.

## Documentação

- [Arquitetura white-label](docs/WHITE_LABEL_ARCHITECTURE.md)
- [Atualização das instalações](docs/UPDATING_INSTALLATIONS.md)
- [Versão e schema](platform.json)
