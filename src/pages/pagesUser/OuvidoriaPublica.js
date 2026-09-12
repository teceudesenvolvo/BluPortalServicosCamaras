import React from 'react';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { LiaBullhornSolid, LiaClipboardCheckSolid, LiaCommentsSolid, LiaFileAltSolid, LiaLockSolid, LiaQuestionCircleSolid } from 'react-icons/lia';

const channels = [
  { title: 'Registrar manifestação', text: 'Envie uma denúncia, reclamação, sugestão, elogio ou solicitação.', icon: <LiaBullhornSolid />, path: '/ouvidoria-publica/nova', primary: true },
  { title: 'Acompanhar manifestações', text: 'Acesse suas manifestações identificadas pelo Portal.', icon: <LiaClipboardCheckSolid />, path: '/ouvidoria' },
  { title: 'Carta de serviços', text: 'Conheça os serviços, canais e compromissos de atendimento.', icon: <LiaFileAltSolid />, path: '/ouvidoria-publica/carta-de-servicos' },
];

export default function OuvidoriaPublica() {
  const navigate = useNavigate();
  const { settings } = useSystemControl();
  const { currentUser } = useAuth();
  return <main className="ouvidoria-public-shell">
    <header className="ouvidoria-public-header">
      <Link to="/" className="ouvidoria-brand">Portal de Serviços</Link>
      <nav aria-label="Navegação da ouvidoria">
        <Link to="/esic-publico">e-SIC · Acesso à informação</Link>
        <Link to="/ouvidoria-publica/sobre">Sobre a Ouvidoria</Link>
        <Link to="/ouvidoria-publica/perguntas-frequentes">Perguntas frequentes</Link>
        <Link to="/ouvidoria-publica/privacidade">Privacidade</Link>
        <Link to="/ouvidoria-publica/prazos">Prazos</Link>
        <Link to="/ouvidoria-publica/relatorios">Relatórios</Link>
      </nav>
    </header>

    <section className="ouvidoria-hero">
      <div>
        <span className="ouvidoria-kicker">CANAL DE ESCUTA E PARTICIPAÇÃO</span>
        <h1>Ouvidoria da Câmara</h1>
        <p>Registre sua manifestação a qualquer hora, com ou sem identificação. A Ouvidoria recebe, analisa, encaminha e responde pelos canais disponíveis.</p>
        <div className="ouvidoria-hero-actions">
          <button className="btn-primary" onClick={() => navigate('/ouvidoria-publica/nova')}><LiaBullhornSolid /> Nova manifestação</button>
          {currentUser && <button className="btn-secondary" onClick={() => navigate('/ouvidoria')}>Minhas manifestações</button>}
        </div>
      </div>
      <aside className="ouvidoria-trust-card">
        <LiaLockSolid size={32} />
        <strong>Sigilo e respeito</strong>
        <span>Denúncias podem ser encaminhadas sem identificação. Dados pessoais são usados somente para o tratamento da manifestação.</span>
      </aside>
    </section>

    <section className="ouvidoria-channel-grid" aria-label="Serviços da Ouvidoria">
      {channels.map(channel => <button key={channel.title} className={`ouvidoria-channel ${channel.primary ? 'is-primary' : ''}`} onClick={() => navigate(channel.path)}>
        <span className="ouvidoria-channel-icon">{channel.icon}</span><span><strong>{channel.title}</strong><small>{channel.text}</small></span>
      </button>)}
    </section>

    <section className="ouvidoria-info-grid">
      <article><LiaCommentsSolid /><h2>O que você pode enviar</h2><p>Denúncia, reclamação, solicitação, sugestão, elogio ou pedido de simplificação de um serviço. Pedido de acesso à informação deve usar o canal e-SIC.</p></article>
      <article><LiaClipboardCheckSolid /><h2>Como funciona</h2><p>Recebimento, triagem, encaminhamento à área responsável, resposta conclusiva e avaliação do atendimento. Você recebe protocolo ao finalizar.</p></article>
      <article><LiaQuestionCircleSolid /><h2>Transparência</h2><p>Consulte carta de serviços, prazos de atendimento, relatórios e informações sobre proteção de dados.</p><Link to="/ouvidoria-publica/sobre">Ver informações institucionais</Link></article>
    </section>

    <section className="ouvidoria-info-grid">
      <article><h2>Atendimento da Câmara</h2><p>{settings.tenant.name}</p><p>{settings.tenant.address}</p>{settings.tenant.phone && <p>Telefone: {settings.tenant.phone}</p>}{settings.tenant.email && <p>E-mail: {settings.tenant.email}</p>}<p>Consulte a Câmara para confirmar o responsável e o horário de atendimento da Ouvidoria.</p></article>
      <article><h2>Informação pública ou manifestação?</h2><p>Use a Ouvidoria para solicitar providências ou avaliar um serviço. Para obter documentos e informações que a Câmara mantém, utilize o Serviço de Informação ao Cidadão.</p><Link to="/esic-publico">Conheça o e-SIC</Link></article>
    </section>
    <footer className="ouvidoria-public-footer"><span>Ouvidoria da Câmara Municipal</span><span>Canal permanente de participação social e controle cidadão.</span></footer>
  </main>;
}
