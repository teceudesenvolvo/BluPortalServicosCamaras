# Atualização das instalações

## Relação entre repositórios

- `origin`: repositório privado da Câmara, contendo configuração e extensões locais.
- `platform`: este repositório base, mantido pela Blu Tecnologias.

Configure no repositório da Câmara a variável GitHub `BLU_PLATFORM_UPSTREAM` com `teceudesenvolvo/BluPortalServicosCamaras`. O workflow `sync-platform.yml` verifica atualizações semanalmente e abre um pull request. Ele não publica diretamente em produção.

O recebimento do PR é automático. Para incorporar a atualização depois dos checks, habilite **Allow auto-merge** no GitHub e defina `BLU_PLATFORM_AUTO_MERGE=true`. A publicação ainda depende de um pipeline do servidor acionado por mudanças em `main`, pois cada Câmara possui projeto Firebase e credenciais próprios.

## Fluxo de atualização

1. Atualize e teste o núcleo neste repositório base.
2. Gere uma versão em `platform.json` e registre migrações incompatíveis.
3. O workflow cria um pull request em cada instalação.
4. A CI da Câmara executa validação do tenant, testes e build.
5. Publique primeiro em staging.
6. Após homologação, faça o merge e publique em produção.

## Conflitos

Conflitos em `src` indicam que a instalação alterou o core. Extraia a personalização para configuração, tema ou extensão antes de concluir a atualização. Os arquivos `tenants/<slug>` pertencem à Câmara e não devem ser substituídos pelo upstream.

## Versionamento

Use versionamento semântico para o núcleo:

- patch: correções compatíveis;
- minor: novos recursos compatíveis;
- major: mudanças que exigem migração.

Cada configuração possui `schemaVersion`. O build deve falhar quando a instalação usa um schema menor que `minimumTenantSchema` em `platform.json`.
