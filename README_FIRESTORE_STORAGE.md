# Guia de Integração Firebase (Firestore & Storage)

Este documento descreve a estrutura de dados e os caminhos de armazenamento utilizados no **Portal de Serviços** para que possam ser replicados fielmente no aplicativo móvel.

## 1. Configuração Base

- **Cidade (Tenant):** Definida em `src/config.js` via `cityCollection`. 
  - Valor atual: `paraipaba`
- **Prefixo de Caminhos:** A maioria dos caminhos de Storage utiliza `${cityCollection}/...` para isolar os dados por município.

---

## 2. Firestore: Coleções e Estruturas

### 2.1 Usuários (`users`)
Armazena o perfil completo do cidadão.
- **Caminho:** `users/{userId}`
- **Campos Principais:**
  - `name`: Nome completo.
  - `cpf`: CPF (formatado).
  - `email`: E-mail de cadastro.
  - `phone`: Telefone de contato.
  - `address`, `numero`, `bairro`, `city`, `state`, `cep`: Endereço completo.
  - `avatarBase64`: URL da imagem de perfil (Firebase Storage).
  - `tipo`: Tipo de usuário (ex: 'Cidadão', 'Admin', 'Vereador').

### 2.2 Balcão do Cidadão (`balcao-cidadao`)
Solicitações gerais e emissão de documentos.
- **Caminho:** `balcao-cidadao/{docId}`
- **Campos Principais:**
  - `userId`: ID do usuário que criou a solicitação.
  - `status`: 'Aguardando Atendimento', 'Documentação Reenviada', 'Concluído', etc.
  - `dadosSolicitacao`:
    - `assunto`: 'Emissão de Documentos', 'Informações Gerais', etc.
    - `tipoDocumento`: 'cin' (Identidade), 'cpf', etc.
    - `descricao`: Texto livre.
    - `anexos`: Objeto contendo arrays de arquivos (ex: `{ cin_certidao: [{ name, url, type }] }`).
  - `dadosBeneficiario`: Dados de quem receberá o serviço (pode ser o próprio usuário ou terceiro).
  - `dataSolicitacao`: Timestamp de criação.
  - `source`: 'web' (no app deve ser 'mobile').

### 2.3 Ouvidoria (`ouvidoria`)
Manifestações, elogios e reclamações.
- **Caminho:** `ouvidoria/{docId}`
- **Campos Principais:**
  - `userId`: ID do usuário (ou 'anonimo').
  - `tipoManifestacao`: 'Reclamação', 'Sugestão', 'Elogio', 'Denúncia'.
  - `assunto`: Assunto resumido.
  - `descricao`: Relato detalhado.
  - `anexos`: Array de objetos `{ name, url, type }`.
  - `status`: 'Pendente', 'Em Análise', etc.

### 2.4 Procon (`denuncias-procon`)
Reclamações de consumo.
- **Caminho:** `denuncias-procon/{docId}`
- **Campos Principais:**
  - `protocolo`: Número gerado aleatoriamente.
  - `tipoReclamacao`, `classificacao`, `assuntoDenuncia`.
  - `cnpjEmpresaReclamada`, `companyName`.
  - `descricao`, `pedidoConsumidor`.
  - `arquivos`: Array de anexos com `url`.
  - `userDataAtTimeOfComplaint`: Snapshot dos dados do usuário no momento da denúncia.

### 2.5 Outras Coleções
- `procuradoria-mulher`: Estrutura similar à Ouvidoria.
- `solicitacoes-vereadores`: Pedidos diretos aos gabinetes.
- `atendimento-juridico`: Solicitações de assistência jurídica.
- `piel`: Informativos Legislativos.

---

## 3. Firebase Storage: Caminhos e Naming

Todos os arquivos devem ser enviados com nomes únicos (UUID) para evitar sobreposição.

### 3.1 Avatars de Perfil
- **Caminho:** `${cityCollection}/perfil/${userId}/${uuid}.jpg`

### 3.2 Anexos de Documentos
A regra geral segue o padrão:
- **Caminho:** `${cityCollection}/${colecao}/${userId}/anexos/${uuid}.extension`

**Exemplos:**
- `paraipaba/balcao-cidadao/{userId}/anexos/123-abc.pdf`
- `paraipaba/ouvidoria/{userId}/anexos/456-def.jpg`
- `denuncias-procon/{userId}/anexos/789-ghi.png` (Algumas implementações antigas podem omitir o prefixo da cidade).

---

## 4. Regras de Negócio Importantes

1. **Snapshots de Usuário:** Ao criar uma solicitação (Procon, Balcão), sempre salve uma cópia dos dados de contato do usuário (`userDataAtTimeOfComplaint` ou `dadosUsuario`) dentro do documento. Isso garante que, se o usuário mudar o telefone no perfil meses depois, o histórico daquela solicitação mantenha os dados originais.
2. **Status Inicial:** O status padrão para novas solicitações é geralmente `Aguardando Atendimento`.
3. **Source:** Utilize o campo `source: 'mobile'` para diferenciar as solicitações vindas do aplicativo.
4. **Timestamps:** Use `serverTimestamp()` do Firestore para datas de criação e atualização.
