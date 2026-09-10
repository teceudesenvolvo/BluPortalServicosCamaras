# Arquitetura white-label da Blu Câmara

## Modelo adotado

Este repositório é o **núcleo da plataforma**. Cada Câmara mantém uma instalação em um repositório próprio criado a partir desta base. Código compartilhado permanece no núcleo; identidade, configuração e extensões locais ficam em áreas próprias para reduzir conflitos durante atualizações.

O modelo segue dois princípios conhecidos:

- WordPress mantém temas e plugins fora do núcleo, pois atualizações substituem arquivos do core.
- Adobe Commerce separa configuração compartilhada, configuração específica do ambiente e valores sensíveis, com build, staging e produção distintos.

Referências oficiais:

- https://developer.wordpress.org/plugins/intro/
- https://developer.wordpress.org/advanced-administration/upgrade/upgrading/
- https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/deployment/overview
- https://experienceleague.adobe.com/en/docs/commerce-on-cloud/user-guide/configure-store/store-settings

## Camadas

1. **Core:** `src`, `functions`, regras Firebase, scripts e componentes mantidos pela Blu.
2. **Tenant versionado:** `tenants/<slug>/tenant.config.json`, identidade inicial que acompanha o repositório da Câmara.
3. **Configuração editável:** documento `system-control/portal`, administrado pelo CMS e sobreposto ao arquivo do tenant em tempo de execução.
4. **Ambiente:** `.env.local`, variáveis do servidor e configuração Firebase específica de cada instalação.
5. **Secrets:** Firebase/Google Secret Manager. Tokens e senhas nunca entram no arquivo do tenant ou Firestore público ao cliente.
6. **Extensões locais:** futuras integrações específicas devem entrar em `extensions/<fornecedor-ou-camara>` e usar contratos públicos do core. Alterações diretas em componentes centrais devem ser evitadas.

## Ordem de configuração

Da menor para a maior prioridade:

1. padrões definidos no código;
2. `public/tenant-config.json` criado durante a instalação;
3. configuração salva pelo CMS no Firestore;
4. variáveis e secrets do ambiente para endpoints protegidos.

## Nova Câmara

```bash
git clone https://github.com/teceudesenvolvo/BluPortalServicosCamaras.git camara-municipio
cd camara-municipio
git remote rename origin platform
git remote add origin git@github.com:SUA-ORGANIZACAO/camara-municipio.git
npm install
npm run tenant:create -- --slug=municipio --name="Câmara Municipal de Município" --city=Município --state=CE --rootEmail=administrador@camara.gov.br
npm run tenant:validate
git add .
git commit -m "Configurar tenant da Câmara de Município"
git push -u origin main
```

Depois, configure `.env.local`, crie ou selecione o projeto Firebase da Câmara, publique regras, Functions e Hosting, e finalize a identidade em **Controle do sistema**.

## Regra de personalização

Não altere o core para trocar nome, cor, marca, endpoint ou disponibilidade de módulo. Use o CMS ou o arquivo do tenant. Código local deve ser implementado como extensão com um ponto de integração documentado. Uma mudança útil para todas as Câmaras deve voltar ao repositório base.
