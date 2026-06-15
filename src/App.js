import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';

// Importa o provedor de autenticação
import { AuthProvider } from './contexts/FirebaseAuthContext';

// Importa as páginas
import HomePage from './pages/HomePage';
import LoginPage from './pages/Login';
import CadastroPage from './pages/Cadastro';
import Perfil from './pages/Perfil';
import NoticiaDetalhe from './pages/NoticiaDetalhe';

// Componentes Globais
import DevelopmentPopup from './components/DevelopmentPopup';

// Páginas Usuário Comum
import DownloadApp from './pages/DownloadApp';
import Painel from './pages/pagesUser/Painel';
import Procon from './pages/pagesUser/realizarReclamacaoProcon';
import ProconAtendimentos from './pages/pagesUser/ProconAtendimentos';
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

import AdminPiel from './pages/pagesAdmin/AdminPiel';
import AdminProcon from './pages/pagesAdmin/AdminProcon';
import AdminJuridico from './pages/pagesAdmin/AdminJuridico';
import AdminBalcao from './pages/pagesAdmin/AdminBalcao';
import AdminBalcaoSolicitacoes from './pages/pagesAdmin/AdminBalcaoSolicitacoes';
import AdminNoticiasSite from './pages/pagesAdmin/AdminNoticiasSite';
import AdminOuvidoria from './pages/pagesAdmin/AdminOuvidoria';
import AdminProcuradoria from './pages/pagesAdmin/AdminProcuradoria';
import AdminVereadores from './pages/pagesAdmin/AdminVereadores';
import AdminUsers from './pages/pagesAdmin/AdminUsers';
import AdminMigration from './pages/pagesAdmin/AdminMigration';
import AdminMail from './pages/pagesAdmin/AdminMail';
import AdminNotifications from './pages/pagesAdmin/AdminNotifications';
import AdminMensagens from './pages/pagesAdmin/AdminMensagens';
import RecepcaoAtendimento from './pages/pagesAdmin/RecepcaoAtendimento';
import PainelAtendimento from './pages/pagesAdmin/PainelAtendimento';


function App() {
  return (
    // 1. Envolve toda a aplicação com o AuthProvider
    <AuthProvider>
      <Router>
        <DevelopmentPopup />
        <Routes>
          {/* Sem Login */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<CadastroPage />} />
          <Route path="/download-app" element={<DownloadApp />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/noticia/:id" element={<NoticiaDetalhe />} />

          {/* Com Login - Usuário Comum */}
          <Route path="/dashboard" element={<Painel />} />
          <Route path="/procon" element={<Procon />} />
          <Route path="/procon-atendimentos" element={<ProconAtendimentos />} />
          <Route path="/juridico" element={<AtendimentoJuridico />} />
          <Route path="/juridico/novo" element={<NovoAtendimentoJuridico />} />
          <Route path="/balcao" element={<BalcaoCidadao />} />
          <Route path="/balcao/novo" element={<NovoBalcaoCidadao />} />
          <Route path="/ouvidoria" element={<Ouvidoria />} />
          <Route path="/ouvidoria/nova" element={<NovaOuvidoria />} />
          <Route path="/procuradoria" element={<Procuradoria />} />
          <Route path="/procuradoria/nova" element={<NovaProcuradoria />} />
          <Route path="/mensagens" element={<MensagensUsuario />} />
          <Route path="/procuradoria/panico-config" element={<ConfigurarPanico />} />
          <Route path="/vereadores" element={<SolicitacoesVereadores />} />
          <Route path="/vereadores/nova" element={<NovaSolicitacaoVereador />} />
          <Route path="/piel" element={<Piel />} />
          <Route path="/tv-camara" element={<TvCamara />} />

          {/* Com Login - Admin */}
          <Route path="/admin-procon" element={<AdminProcon />} />
          <Route path="/admin-juridico" element={<AdminJuridico />} />
          <Route path="/admin-noticias" element={<AdminNoticiasSite />} />
          <Route path="/admin-balcao" element={<AdminBalcao />} />
          <Route path="/admin-balcao/solicitacoes" element={<AdminBalcaoSolicitacoes />} />
          <Route path="/admin-ouvidoria" element={<AdminOuvidoria />} />
          <Route path="/admin-procuradoria" element={<AdminProcuradoria />} />
          <Route path="/admin-vereadores" element={<AdminVereadores />} />
          <Route path="/admin-users" element={<AdminUsers />} />
          <Route path="/admin-piel" element={<AdminPiel />} />
          <Route path="/admin-balcao/agendamentos" element={<AdminBalcaoAgendamentos />} />
          <Route path="/admin-mail" element={<AdminMail />} />
          <Route path="/admin-notifications" element={<AdminNotifications />} />
          <Route path="/admin-mensagens" element={<AdminMensagens />} />
          <Route path="/admin-migration" element={<AdminMigration />} />
          <Route path="/recepcao" element={<RecepcaoAtendimento />} />
          <Route path="/painel-atendimento" element={<PainelAtendimento />} />

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
