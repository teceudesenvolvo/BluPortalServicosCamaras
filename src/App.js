import React from 'react';
import { BrowserRouter as Router, Navigate, Routes, Route } from 'react-router-dom';
import './App.css';

// Importa o provedor de autenticação
import { AuthProvider } from './contexts/FirebaseAuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SystemControlProvider } from './contexts/SystemControlContext';
import { ModuleRoute, OwnerRoute } from './components/SystemRouteGuard';

// Importa as páginas
import HomePage from './pages/HomePage';
import LoginPage from './pages/Login';
import CadastroPage from './pages/Cadastro';
import Perfil from './pages/Perfil';
import NoticiaDetalhe from './pages/NoticiaDetalhe';

// Componentes Globais
import DevelopmentPopup from './components/DevelopmentPopup';
import ThemeToggle from './components/ThemeToggle';

// Páginas Usuário Comum
import DownloadApp from './pages/DownloadApp';
import Painel from './pages/pagesUser/Painel';
import ProconReclamacao from './pages/pagesUser/realizarReclamacaoProcon';
import ProconAtendimentos from './pages/pagesUser/ProconAtendimentos';
import ProconPortal from './pages/pagesUser/ProconPortal';
import ProconAgendamento from './pages/pagesUser/ProconAgendamento';
import AtendimentoJuridico from './pages/pagesUser/AtendimentoJuridico';
import NovoAtendimentoJuridico from './pages/pagesUser/NovoAtendimentoJuridico';
import BalcaoCidadao from './pages/pagesUser/BalcaoCidadao';
import NovoBalcaoCidadao from './pages/pagesUser/NovoBalcaoCidadao';
import Ouvidoria from './pages/pagesUser/Ouvidoria';
import NovaOuvidoria from './pages/pagesUser/NovaOuvidoria';
import Procuradoria from './pages/pagesUser/Procuradoria';
import NovaProcuradoria from './pages/pagesUser/NovaProcuradoria';
import MensagensUsuario from './pages/pagesUser/MensagensUsuario';
import ConfigurarPanico from './pages/pagesUser/ConfigurarPanico';
import SolicitacoesVereadores from './pages/pagesUser/SolicitacoesVereadores';
import Piel from './pages/pagesUser/Piel';
import NovaSolicitacaoVereador from './pages/pagesUser/NovaSolicitacaoVereador';
import AdminBalcaoAgendamentos from './pages/pagesAdmin/AdminBalcaoAgendamentos';
import TvCamara from './pages/pagesUser/TvCamara';
import Microempreendedor from './pages/pagesUser/Microempreendedor';
import NovaMicroempreendedor from './pages/pagesUser/NovaMicroempreendedor';
import AvaliarAtendimento from './pages/pagesUser/AvaliarAtendimento';

import AdminPiel from './pages/pagesAdmin/AdminPiel';
import AdminProcon from './pages/pagesAdmin/AdminProconModule';
import AdminJuridico from './pages/pagesAdmin/AdminJuridico';
import AdminBalcao from './pages/pagesAdmin/AdminBalcao';
import AdminBalcaoSolicitacoes from './pages/pagesAdmin/AdminBalcaoSolicitacoes';
import AdminNoticiasSite from './pages/pagesAdmin/AdminNoticiasSite';
import AdminOuvidoria from './pages/pagesAdmin/AdminOuvidoria';
import AdminProcuradoria from './pages/pagesAdmin/AdminProcuradoria';
import AdminVereadores from './pages/pagesAdmin/AdminVereadores';
import AdminAgendaVereadores from './pages/pagesAdmin/AdminAgendaVereadores';
import AdminUsers from './pages/pagesAdmin/AdminUsers';
import AdminMail from './pages/pagesAdmin/AdminMail';
import AdminNotifications from './pages/pagesAdmin/AdminNotifications';
import AdminMensagens from './pages/pagesAdmin/AdminMensagens';
import RecepcaoAtendimento from './pages/pagesAdmin/RecepcaoAtendimento';
import PainelAtendimento from './pages/pagesAdmin/PainelAtendimento';
import AdminTvCamara from './pages/pagesAdmin/AdminTvCamara';
import AdminMicroempreendedor from './pages/pagesAdmin/AdminMicroempreendedor';
import AdminAvaliacoes from './pages/pagesAdmin/AdminAvaliacoes';
import AdminAtendimentosGuiches from './pages/pagesAdmin/AdminAtendimentosGuiches';
import SystemControl from './pages/pagesAdmin/SystemControl';
import InstallationWizard from './pages/InstallationWizard';
import { hasRuntimeFirebaseConfig } from './firebase';


function App() {
  if (!hasRuntimeFirebaseConfig) {
    return <ThemeProvider><Router><Routes><Route path="/instalacao" element={<InstallationWizard />} /><Route path="*" element={<Navigate to="/instalacao" replace />} /></Routes></Router></ThemeProvider>;
  }
  return (
    // 1. Envolve toda a aplicação com o AuthProvider
    <ThemeProvider>
      <AuthProvider>
        <SystemControlProvider>
        <Router>
        <DevelopmentPopup />
        <ThemeToggle />
        <Routes>
          <Route path="/instalacao" element={<InstallationWizard />} />
          {/* Sem Login */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<CadastroPage />} />
          <Route path="/download-app" element={<DownloadApp />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/noticia/:id" element={<NoticiaDetalhe />} />

          {/* Com Login - Usuário Comum */}
          <Route path="/dashboard" element={<Painel />} />
          <Route path="/procon" element={<ModuleRoute surface="portal"><ProconPortal /></ModuleRoute>} />
          <Route path="/procon/reclamacao" element={<ModuleRoute surface="portal"><ProconReclamacao /></ModuleRoute>} />
          <Route path="/procon/agendar" element={<ModuleRoute surface="portal"><ProconAgendamento /></ModuleRoute>} />
          <Route path="/procon-atendimentos" element={<ModuleRoute surface="portal"><ProconAtendimentos /></ModuleRoute>} />
          <Route path="/juridico" element={<ModuleRoute surface="portal"><AtendimentoJuridico /></ModuleRoute>} />
          <Route path="/juridico/novo" element={<ModuleRoute surface="portal"><NovoAtendimentoJuridico /></ModuleRoute>} />
          <Route path="/balcao" element={<ModuleRoute surface="portal"><BalcaoCidadao /></ModuleRoute>} />
          <Route path="/balcao/novo" element={<ModuleRoute surface="portal"><NovoBalcaoCidadao /></ModuleRoute>} />
          <Route path="/ouvidoria" element={<ModuleRoute surface="portal"><Ouvidoria /></ModuleRoute>} />
          <Route path="/ouvidoria/nova" element={<ModuleRoute surface="portal"><NovaOuvidoria /></ModuleRoute>} />
          <Route path="/procuradoria" element={<ModuleRoute surface="portal"><Procuradoria /></ModuleRoute>} />
          <Route path="/procuradoria/nova" element={<ModuleRoute surface="portal"><NovaProcuradoria /></ModuleRoute>} />
          <Route path="/mensagens" element={<ModuleRoute surface="portal"><MensagensUsuario /></ModuleRoute>} />
          <Route path="/procuradoria/panico-config" element={<ModuleRoute surface="portal"><ConfigurarPanico /></ModuleRoute>} />
          <Route path="/vereadores" element={<ModuleRoute surface="portal"><SolicitacoesVereadores /></ModuleRoute>} />
          <Route path="/vereadores/nova" element={<ModuleRoute surface="portal"><NovaSolicitacaoVereador /></ModuleRoute>} />
          <Route path="/piel" element={<ModuleRoute surface="portal"><Piel /></ModuleRoute>} />
          <Route path="/tv-camara" element={<ModuleRoute surface="portal"><TvCamara /></ModuleRoute>} />
          <Route path="/microempreendedor" element={<ModuleRoute surface="portal"><Microempreendedor /></ModuleRoute>} />
          <Route path="/microempreendedor/novo" element={<ModuleRoute surface="portal"><NovaMicroempreendedor /></ModuleRoute>} />
          <Route path="/avaliar-atendimento/:protocolo" element={<ModuleRoute surface="portal"><AvaliarAtendimento /></ModuleRoute>} />

          {/* Com Login - Admin */}
          <Route path="/admin-procon" element={<ModuleRoute surface="admin"><AdminProcon /></ModuleRoute>} />
          <Route path="/admin-juridico" element={<ModuleRoute surface="admin"><AdminJuridico /></ModuleRoute>} />
          <Route path="/admin-noticias" element={<ModuleRoute surface="admin"><AdminNoticiasSite /></ModuleRoute>} />
          <Route path="/admin-balcao" element={<ModuleRoute surface="admin"><AdminBalcao /></ModuleRoute>} />
          <Route path="/admin-balcao/solicitacoes" element={<ModuleRoute surface="admin"><AdminBalcaoSolicitacoes /></ModuleRoute>} />
          <Route path="/admin-ouvidoria" element={<ModuleRoute surface="admin"><AdminOuvidoria /></ModuleRoute>} />
          <Route path="/admin-procuradoria" element={<ModuleRoute surface="admin"><AdminProcuradoria /></ModuleRoute>} />
          <Route path="/admin-vereadores" element={<ModuleRoute surface="admin"><AdminVereadores /></ModuleRoute>} />
          <Route path="/admin-agenda-vereadores" element={<ModuleRoute surface="admin"><AdminAgendaVereadores /></ModuleRoute>} />
          <Route path="/admin-users" element={<ModuleRoute surface="admin"><AdminUsers /></ModuleRoute>} />
          <Route path="/admin-piel" element={<ModuleRoute surface="admin"><AdminPiel /></ModuleRoute>} />
          <Route path="/admin-balcao/agendamentos" element={<ModuleRoute surface="admin"><AdminBalcaoAgendamentos /></ModuleRoute>} />
          <Route path="/admin-balcao/atendimentos-guiches" element={<ModuleRoute surface="admin"><AdminAtendimentosGuiches /></ModuleRoute>} />
          <Route path="/admin-mail" element={<AdminMail />} />
          <Route path="/admin-notifications" element={<AdminNotifications />} />
          <Route path="/admin-mensagens" element={<ModuleRoute surface="admin"><AdminMensagens /></ModuleRoute>} />
          <Route path="/admin-tv-camara" element={<ModuleRoute surface="admin"><AdminTvCamara /></ModuleRoute>} />
          <Route path="/admin-microempreendedor" element={<ModuleRoute surface="admin"><AdminMicroempreendedor /></ModuleRoute>} />
          <Route path="/admin-avaliacoes" element={<ModuleRoute surface="admin"><AdminAvaliacoes /></ModuleRoute>} />
          <Route path="/admin-migration" element={<Navigate to="/controle-sistema" replace />} />
          <Route path="/recepcao" element={<ModuleRoute surface="admin"><RecepcaoAtendimento /></ModuleRoute>} />
          <Route path="/painel-atendimento" element={<PainelAtendimento />} />
          <Route path="/controle-sistema" element={<OwnerRoute><SystemControl /></OwnerRoute>} />

        </Routes>
        </Router>
        </SystemControlProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
