import React from 'react';
import {useNavigate} from 'react-router-dom';
import {LiaArrowRightSolid, LiaBuildingSolid, LiaClipboardListSolid, LiaCommentsSolid, LiaFemaleSolid, LiaGavelSolid, LiaGraduationCapSolid, LiaHandshakeSolid, LiaLandmarkSolid, LiaShieldAltSolid, LiaTvSolid, LiaUserFriendsSolid} from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import {useAuth} from '../../contexts/FirebaseAuthContext';
import {useSystemControl} from '../../contexts/SystemControlContext';
import {SYSTEM_MODULES} from '../../config/systemModules';
import {canAccessModule} from '../../config/rolePermissions';

const icons = {protocolo:LiaClipboardListSolid, esic:LiaClipboardListSolid, agendaVereadores:LiaLandmarkSolid, legislativo:LiaGavelSolid, juridico:LiaGavelSolid, balcao:LiaUserFriendsSolid, microempreendedor:LiaHandshakeSolid, recepcao:LiaBuildingSolid, mensagens:LiaCommentsSolid, tvCamara:LiaTvSolid, ouvidoria:LiaCommentsSolid, procuradoria:LiaFemaleSolid, procon:LiaShieldAltSolid, escolaParlamento:LiaGraduationCapSolid};

export default function AdminDashboard() {
  const navigate = useNavigate(); const {currentUser, role} = useAuth(); const {settings} = useSystemControl();
  const modules = SYSTEM_MODULES.filter(module => module.adminPaths[0] && canAccessModule(settings, role, currentUser?.email, module.id, 'admin'));
  return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content user-dashboard-content admin-dashboard-content"><header className="page-header-container user-dashboard-hero"><div className="header-title-section"><span className="user-dashboard-eyebrow">Área de gestão</span><h1>{settings.tenant?.name || 'Câmara Municipal'}</h1><p>Acesse os módulos administrativos liberados para o seu perfil e acompanhe o trabalho institucional.</p></div></header><div className="user-dashboard-section-heading"><div><h2>Módulos administrativos</h2><p>Escolha uma área para iniciar sua operação.</p></div></div><section className="services-grid-main">{modules.map(module => { const Icon = icons[module.id] || LiaBuildingSolid; return <button type="button" className="service-card-dashboard" key={module.id} onClick={() => navigate(module.adminPaths[0])}><span className="card-icon-dashboard"><Icon /></span><div className="service-card-dashboard-copy"><p className="card-title-dashboard">{module.name}</p><span>{module.description}</span></div><span className="service-card-dashboard-action"><LiaArrowRightSolid /></span></button>; })}</section></main></div>;
}
