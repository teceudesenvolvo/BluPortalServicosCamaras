import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { LiaArrowLeftSolid, LiaCheckCircleSolid, LiaPaperPlane } from 'react-icons/lia';
import { firestore } from '../../firebase';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import config from '../../config';

const TYPES = ['Denúncia', 'Reclamação', 'Solicitação', 'Sugestão', 'Elogio', 'Simplifique'];
const protocolFromId = id => `OUV-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;

export default function NovaOuvidoria() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [form, setForm] = useState({ tipoManifestacao: '', identificacao: 'anonimo', nome: '', email: '', telefone: '', assunto: '', descricao: '', localFato: '', dataFato: '', envolvidos: '' });
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [protocol, setProtocol] = useState('');

  const loadProfile = useCallback(async () => {
    if (!currentUser) return;
    try {
      const snap = await getDoc(doc(firestore, 'users', currentUser.uid));
      const data = snap.data() || {};
      setForm(previous => ({ ...previous, identificacao: 'identificado', nome: data.name || data.nome || currentUser.displayName || '', email: data.email || currentUser.email || '', telefone: data.telefone || data.phone || '' }));
    } catch (requestError) { console.warn('Não foi possível preencher os dados do perfil.', requestError); }
  }, [currentUser]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  const anonymous = form.identificacao === 'anonimo';
  const submit = async event => {
    event.preventDefault();
    if (!form.tipoManifestacao || !form.assunto.trim() || !form.descricao.trim()) { setError('Informe o tipo, o assunto e a descrição da manifestação.'); return; }
    if (anonymous && form.tipoManifestacao !== 'Denúncia') { setError('O envio anônimo está disponível somente para denúncias. Para os demais tipos, informe um canal de retorno.'); return; }
    if (!anonymous && !currentUser) { setError('Entre no Portal para enviar uma manifestação identificada.'); return; }
    if (!anonymous && (!form.nome.trim() || !form.email.trim())) { setError('Não foi possível localizar os dados do seu perfil. Atualize o cadastro e tente novamente.'); return; }
    setLoading(true); setError('');
    try {
      const ref = doc(collection(firestore, 'ouvidoria'));
      const anexos = [];
      if (files.length && !currentUser) throw new Error('ANEXOS_LOGIN');
      for (const file of files) {
        const uploaded = await uploadFileToStorage(file, `${config.cityCollection}/ouvidoria/${currentUser.uid}/${ref.id}/anexos`);
        anexos.push({ name: uploaded.name, type: uploaded.type, url: uploaded.url });
      }
      const nextProtocol = protocolFromId(ref.id);
      const dadosUsuario = anonymous ? { identificacao: 'Anônimo' } : { identificacao: 'Identificado', id: currentUser?.uid || '', name: form.nome.trim(), email: form.email.trim().toLowerCase(), phone: form.telefone.trim() };
      await setDoc(ref, {
        protocolo: nextProtocol,
        userId: anonymous || !currentUser ? 'anonimo' : currentUser.uid,
        dadosUsuario,
        dadosManifestacao: { tipoManifestacao: form.tipoManifestacao, identificacao: anonymous ? 'anonimo' : 'identificado', assunto: form.assunto.trim(), descricao: form.descricao.trim(), localFato: form.localFato.trim(), dataFato: form.dataFato, envolvidos: form.envolvidos.trim(), anexos },
        status: 'Recebida', etapaAtual: 'Recebimento', origem: currentUser ? 'portal-autenticado' : 'portal-publico', dataManifestacao: serverTimestamp(), ultimaAtualizacao: serverTimestamp(),
      });
      setProtocol(nextProtocol);
    } catch (submitError) {
      console.error('Erro ao enviar manifestação:', submitError);
      setError(submitError.message === 'ANEXOS_LOGIN' ? 'Para anexar arquivos, entre com sua conta. A manifestação pode ser enviada sem anexos.' : 'Não foi possível enviar sua manifestação. Tente novamente.');
    } finally { setLoading(false); }
  };

  if (protocol) return <main className="ouvidoria-public-shell"><section className="ouvidoria-success-card"><LiaCheckCircleSolid size={52} /><p className="ouvidoria-kicker">MANIFESTAÇÃO RECEBIDA</p><h1>Seu protocolo é {protocol}</h1><p>{anonymous ? 'A denúncia foi recebida de forma anônima. Guarde o protocolo para sua referência; não haverá resposta individual.' : 'Guarde este protocolo. Você poderá acompanhar a manifestação ao entrar no Portal com a conta utilizada no envio.'}</p><div className="ouvidoria-page-actions"><button className="btn-primary" onClick={() => navigate('/ouvidoria-publica')}>Voltar à Ouvidoria</button>{currentUser && <button className="btn-secondary" onClick={() => navigate('/ouvidoria')}>Minhas manifestações</button>}</div></section></main>;

  return <main className="ouvidoria-public-shell"><header className="ouvidoria-public-header"><Link to="/ouvidoria-publica" className="ouvidoria-brand">Ouvidoria da Câmara</Link><Link to="/ouvidoria-publica">Cancelar</Link></header><section className="ouvidoria-form-layout"><div className="ouvidoria-form-intro"><p className="ouvidoria-kicker">NOVA MANIFESTAÇÃO</p><h1>Conte o que aconteceu</h1><p>Descreva o fato com clareza. Para receber resposta, escolha a manifestação identificada e informe um e-mail.</p><ul><li>Não inclua senhas, dados bancários ou documentos desnecessários.</li><li>Denúncias podem ser enviadas sem identificação.</li><li>Pedido de informação pública deve ser feito pelo e-SIC.</li></ul></div><form className="ouvidoria-form-card" onSubmit={submit}>
    <div className="form-row"><div className="form-group"><label>Tipo de manifestação *</label><select name="tipoManifestacao" value={form.tipoManifestacao} onChange={change} required><option value="">Selecione</option>{TYPES.map(type => <option key={type}>{type}</option>)}</select></div>{currentUser ? <div className="form-group"><label>Identificação *</label><select name="identificacao" value={form.identificacao} onChange={change}><option value="identificado">Manifestação identificada</option><option value="anonimo">Denúncia anônima</option></select></div> : <div className="form-group"><label>Manifestação identificada</label><button type="button" className="btn-secondary" onClick={() => navigate('/login', { state: { returnTo: '/ouvidoria/nova' } })}>Entrar para me identificar</button><small>O login protege seus dados e permite acompanhar a resposta.</small></div>}</div>
    {!anonymous && <div className="ouvidoria-profile-summary"><strong>Manifestação identificada</strong><span>{form.nome} · {form.email}</span><small>Os dados são obtidos do seu perfil autenticado.</small></div>}
    <div className="form-group"><label>Assunto *</label><input name="assunto" value={form.assunto} onChange={change} maxLength="140" required /></div><div className="form-group"><label>Descrição *</label><textarea name="descricao" value={form.descricao} onChange={change} rows="8" maxLength="8000" required /></div>
    <div className="form-row"><div className="form-group"><label>Data do fato</label><input name="dataFato" type="date" value={form.dataFato} onChange={change} /></div><div className="form-group"><label>Local do fato</label><input name="localFato" value={form.localFato} onChange={change} /></div></div><div className="form-group"><label>Pessoas ou setores envolvidos</label><input name="envolvidos" value={form.envolvidos} onChange={change} /></div>
    {currentUser ? <div className="form-group"><label>Anexos</label><input type="file" multiple onChange={event => setFiles(Array.from(event.target.files))} /><small>Envie apenas arquivos necessários para a análise.</small></div> : <p className="ouvidoria-form-note">O envio público não exige conta. Para anexar arquivos e acompanhar a manifestação, entre no Portal.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}<div className="ouvidoria-page-actions"><Link to="/ouvidoria-publica" className="btn-secondary"><LiaArrowLeftSolid /> Voltar</Link><button className="btn-primary" disabled={loading}><LiaPaperPlane /> {loading ? 'Enviando…' : 'Enviar manifestação'}</button></div>
  </form></section></main>;
}
