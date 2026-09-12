import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { LiaArrowLeftSolid, LiaLockSolid, LiaPaperPlane, LiaUserSolid } from 'react-icons/lia';
import { firestore } from '../../firebase';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import config from '../../config';

const TYPES = ['Denúncia', 'Reclamação', 'Solicitação', 'Sugestão', 'Elogio', 'Simplifique'];

export default function NovaOuvidoriaInterna() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState({});
  const [form, setForm] = useState({ tipoManifestacao: '', identificacao: 'identificado', assunto: '', descricao: '', localFato: '', dataFato: '', envolvidos: '' });
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const anonymous = form.identificacao === 'anonimo';
  const loadProfile = useCallback(async () => { if (!currentUser) return; const snap = await getDoc(doc(firestore, 'users', currentUser.uid)); setProfile(snap.data() || {}); }, [currentUser]);
  useEffect(() => { loadProfile().catch(() => setError('Não foi possível carregar seu perfil.')); }, [loadProfile]);
  useEffect(() => { if (!currentUser) navigate('/login', { replace: true, state: { returnTo: '/ouvidoria/nova' } }); }, [currentUser, navigate]);
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    if (!currentUser || success || loading) return;
    if (!form.tipoManifestacao || !form.assunto.trim() || !form.descricao.trim()) { setError('Informe o tipo, o assunto e a descrição da manifestação.'); return; }
    setLoading(true); setError('');
    try {
      const ref = doc(collection(firestore, 'ouvidoria'));
      const anexos = [];
      for (const file of files) { const uploaded = await uploadFileToStorage(file, `${config.cityCollection}/ouvidoria/${currentUser.uid}/${ref.id}/anexos`); anexos.push({ name: uploaded.name, type: uploaded.type, url: uploaded.url }); }
      const protocolo = `OUV-${new Date().getFullYear()}-${ref.id.slice(0, 8).toUpperCase()}`;
      await setDoc(ref, {
        protocolo,
        userId: anonymous ? 'anonimo' : currentUser.uid,
        dadosUsuario: anonymous ? { identificacao: 'Anônimo' } : { identificacao: 'Identificado', id: currentUser.uid, name: profile.name || profile.nome || currentUser.email, email: profile.email || currentUser.email, phone: profile.telefone || profile.phone || '' },
        dadosManifestacao: { ...form, identificacao: anonymous ? 'anonimo' : 'identificado', assunto: form.assunto.trim(), descricao: form.descricao.trim(), anexos },
        status: 'Recebida', etapaAtual: 'Recebimento', origem: anonymous ? 'portal-autenticado-anonimo' : 'portal-autenticado', dataManifestacao: serverTimestamp(), ultimaAtualizacao: serverTimestamp(),
      });
      setSuccess(`Manifestação ${anonymous ? 'anônima ' : ''}registrada. Guarde seu protocolo: ${protocolo}`);
    } catch (requestError) { console.error('Erro ao enviar manifestação:', requestError); setError('Não foi possível enviar sua manifestação.'); } finally { setLoading(false); }
  };
  return <div className="dashboard-layout"><Sidebar onItemClick={navigate} /><main className="dashboard-content ouvidoria-internal-page"><header className="page-header-container"><div className="header-title-section"><p className="ouvidoria-kicker">CANAL DE PARTICIPAÇÃO</p><h1>Nova manifestação</h1><p>Registre uma solicitação, sugestão, elogio, reclamação ou denúncia para a Ouvidoria.</p></div><div className="user-profile"><div className="user-text"><p className="user-name-display">{profile.name || profile.nome || currentUser?.email}</p><p className="user-type-display">{profile.tipo || 'Cidadão'}</p></div><div className="user-avatar" /></div></header><section className="ouvidoria-internal-layout"><aside className="ouvidoria-internal-help"><LiaLockSolid size={30} /><h2>Seu relato é protegido</h2><p>Você escolhe se deseja se identificar. A manifestação anônima não será associada ao seu perfil e não terá resposta individual.</p><ul><li>Informe fatos de forma objetiva.</li><li>Anexe somente documentos necessários.</li><li>Pedidos de informação pública devem usar o e-SIC.</li></ul></aside><form className="ouvidoria-internal-card" onSubmit={submit}><div className="ouvidoria-form-card-header"><div><h2>Dados da manifestação</h2><p>Os campos com asterisco são obrigatórios.</p></div></div><div className="ouvidoria-identification-choice"><label className={!anonymous ? 'selected' : ''}><input type="radio" name="identificacao" value="identificado" checked={!anonymous} onChange={change}/><LiaUserSolid /><span><strong>Identificada</strong><small>Permite acompanhar e receber resposta no Portal.</small></span></label><label className={anonymous ? 'selected' : ''}><input type="radio" name="identificacao" value="anonimo" checked={anonymous} onChange={change}/><LiaLockSolid /><span><strong>Anônima</strong><small>Não será vinculada ao seu perfil nem receberá resposta individual.</small></span></label></div>{!anonymous&&<div className="ouvidoria-profile-summary"><strong>Manifestante identificado</strong><span>{profile.name || profile.nome || currentUser?.email} · {profile.email || currentUser?.email}</span></div>}<div className="form-row"><div className="form-group"><label>Tipo de manifestação *</label><select name="tipoManifestacao" value={form.tipoManifestacao} onChange={change} required><option value="">Selecione</option>{TYPES.map(type => <option key={type}>{type}</option>)}</select></div><div className="form-group"><label>Data do fato</label><input type="date" name="dataFato" value={form.dataFato} onChange={change} /></div></div><div className="form-group"><label>Assunto *</label><input name="assunto" value={form.assunto} onChange={change} maxLength="140" required /></div><div className="form-group"><label>Descrição *</label><textarea name="descricao" value={form.descricao} onChange={change} rows="8" maxLength="8000" required /></div><div className="form-row"><div className="form-group"><label>Local do fato</label><input name="localFato" value={form.localFato} onChange={change} /></div><div className="form-group"><label>Pessoas ou setores envolvidos</label><input name="envolvidos" value={form.envolvidos} onChange={change} /></div></div><div className="form-group"><label>Anexos</label><input type="file" multiple onChange={event => setFiles(Array.from(event.target.files))} /><small>Envie apenas documentos, imagens ou arquivos necessários para análise.</small></div>{error && <p className="error-message">{error}</p>}{success && <p className="success-message">{success}</p>}<div className="form-actions"><button type="button" className="btn-secondary" onClick={() => navigate('/ouvidoria')}><LiaArrowLeftSolid /> Voltar</button><button className="btn-primary" disabled={loading}><LiaPaperPlane /> {loading ? 'Enviando...' : 'Enviar manifestação'}</button></div></form></section></main></div>;
}
