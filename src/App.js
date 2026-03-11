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

// Páginas Usuário Comum
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
import ConfigurarPanico from './pages/pagesUser/ConfigurarPanico';
import SolicitacoesVereadores from './pages/pagesUser/SolicitacoesVereadores';
import NovaSolicitacaoVereador from './pages/pagesUser/NovaSolicitacaoVereador';

import AdminProcon from './pages/pagesAdmin/AdminProcon';
import AdminJuridico from './pages/pagesAdmin/AdminJuridico';
import AdminBalcao from './pages/pagesAdmin/AdminBalcao';
import AdminOuvidoria from './pages/pagesAdmin/AdminOuvidoria';
import AdminProcuradoria from './pages/pagesAdmin/AdminProcuradoria';
import AdminVereadores from './pages/pagesAdmin/AdminVereadores';
import AdminUsers from './pages/pagesAdmin/AdminUsers';


function App() {
  return (
    // 1. Envolve toda a aplicação com o AuthProvider
    <AuthProvider>
      <Router>
        <Routes>
          {/* Sem Login */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<CadastroPage />} />
          <Route path="/perfil" element={<Perfil />} />
          
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
          <Route path="/procuradoria/panico-config" element={<ConfigurarPanico />} />
          <Route path="/vereadores" element={<SolicitacoesVereadores />} />
          <Route path="/vereadores/nova" element={<NovaSolicitacaoVereador />} />

          {/* Com Login - Admin */}
          <Route path="/admin-procon" element={<AdminProcon />} />
          <Route path="/admin-juridico" element={<AdminJuridico />} />
          <Route path="/admin-balcao" element={<AdminBalcao />} />
          <Route path="/admin-ouvidoria" element={<AdminOuvidoria />} />
          <Route path="/admin-procuradoria" element={<AdminProcuradoria />} />
          <Route path="/admin-vereadores" element={<AdminVereadores />} />
          <Route path="/admin-users" element={<AdminUsers />} />

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;