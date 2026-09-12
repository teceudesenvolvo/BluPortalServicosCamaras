import React from 'react';
import { Link, useParams } from 'react-router-dom';

const pages = {
  'sobre': { title: 'Sobre a Ouvidoria', intro: 'A Ouvidoria é o canal de diálogo entre a Câmara Municipal e a sociedade.', blocks: [
    ['Competências', 'Receber, analisar, orientar, encaminhar e acompanhar manifestações relativas aos serviços e à atuação institucional da Câmara.'],
    ['Tipos de manifestação', 'Denúncia, reclamação, solicitação, sugestão, elogio e simplifique. Pedido de acesso a informações públicas deve ser encaminhado pelo e-SIC.'],
    ['Etapas de tratamento', 'Recebimento, triagem, encaminhamento, análise, resposta conclusiva e avaliação. A manifestação pode ser encaminhada à área competente quando o assunto exigir.'],
  ] },
  'carta-de-servicos': { title: 'Carta de Serviços da Ouvidoria', intro: 'Informações para utilizar este serviço público de forma simples e acessível.', blocks: [
    ['Serviço', 'Registro e tratamento de manifestações sobre serviços, atendimento e atuação da Câmara Municipal.'],
    ['Canais de acesso', 'Formulário eletrônico, atendimento presencial, telefone e e-mail institucional quando disponibilizados pela Câmara.'],
    ['Requisitos', 'Para manifestação identificada, informe nome e um canal de retorno. Denúncias podem ser apresentadas anonimamente.'],
    ['Resultado', 'Protocolo de recebimento e resposta conclusiva pelos canais de contato informados, quando houver identificação.'],
  ] },
  'prazos': { title: 'Prazos de atendimento', intro: 'A Ouvidoria acompanha os prazos e informa o andamento sempre que houver canal de retorno.', blocks: [
    ['Confirmação de recebimento', 'O protocolo é gerado imediatamente após o envio da manifestação.'],
    ['Resposta', 'O prazo depende da complexidade e da necessidade de manifestação das áreas responsáveis. Havendo necessidade de complementação, a Ouvidoria poderá solicitar novas informações.'],
    ['Acompanhamento', 'Manifestações identificadas podem ser acompanhadas na área autenticada do Portal.'],
  ] },
  'privacidade': { title: 'Privacidade e proteção de dados', intro: 'A Ouvidoria aplica a minimização de dados e utiliza as informações apenas para tratar a manifestação.', blocks: [
    ['Dados coletados', 'São solicitados apenas os dados necessários ao retorno e à análise do caso. A identificação é opcional quando o tipo de manifestação permitir anonimato.'],
    ['Acesso', 'Os dados são acessados somente por pessoas autorizadas no tratamento da manifestação. Observações internas não são exibidas ao cidadão.'],
    ['Direitos do titular', 'Você pode solicitar informações sobre o tratamento de seus dados e utilizar o canal do encarregado de dados pessoais divulgado pela Câmara.'],
  ] },
  'perguntas-frequentes': { title: 'Perguntas frequentes', intro: 'Orientações rápidas para utilizar a Ouvidoria.', blocks: [
    ['Posso enviar sem login?', 'Sim. O registro de manifestação está disponível publicamente.'],
    ['Posso fazer denúncia anônima?', 'Sim. Em manifestações anônimas não há retorno individual nem acesso posterior pelo Portal.'],
    ['Ouvidoria e e-SIC são a mesma coisa?', 'Não. A Ouvidoria trata manifestações sobre serviços e atuação institucional; o e-SIC trata pedidos de acesso à informação.'],
  ] },
  'relatorios': { title: 'Relatórios da Ouvidoria', intro: 'Relatórios consolidados devem apresentar volume, tipos de manifestação, prazos e providências, preservando dados pessoais.', blocks: [
    ['Publicação', 'Os relatórios periódicos serão disponibilizados nesta página conforme a consolidação pela unidade responsável.'],
    ['Proteção de dados', 'Os dados divulgados são agregados e não identificam manifestantes.'],
  ] },
};

export default function OuvidoriaInstitucional() {
  const { page } = useParams();
  const content = pages[page] || pages.sobre;
  return <main className="ouvidoria-public-shell ouvidoria-institutional"><header className="ouvidoria-public-header"><Link to="/ouvidoria-publica" className="ouvidoria-brand">Ouvidoria da Câmara</Link><Link to="/ouvidoria-publica/nova">Registrar manifestação</Link></header><article className="ouvidoria-institutional-card"><p className="ouvidoria-kicker">INFORMAÇÕES AO CIDADÃO</p><h1>{content.title}</h1><p className="ouvidoria-lead">{content.intro}</p>{content.blocks.map(([title, text]) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}<div className="ouvidoria-page-actions"><Link className="btn-primary" to="/ouvidoria-publica/nova">Registrar manifestação</Link><Link className="btn-secondary" to="/ouvidoria-publica">Voltar à Ouvidoria</Link></div></article></main>;
}
