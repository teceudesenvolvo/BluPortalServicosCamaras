import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { auth, firestore } from '../firebase';

const CompanyRegistration = () => {
    const navigate = useNavigate();
    const [form, setForm] = useState({ legalName: '', tradeName: '', cnpj: '', representative: '', email: '', phone: '', password: '' });
    const [feedback, setFeedback] = useState('');
    const change = event => setForm({ ...form, [event.target.name]: event.target.value });
    const submit = async event => {
        event.preventDefault(); setFeedback('Criando acesso...');
        try {
            const credential = await createUserWithEmailAndPassword(auth, form.email.trim().toLowerCase(), form.password);
            await setDoc(doc(firestore, 'users', credential.user.uid), { ...form, email: form.email.trim().toLowerCase(), tipo: 'Empresa', role: 'fornecedor', createdAt: serverTimestamp(), active: true }, { merge: true });
            navigate('/fornecedor');
        } catch (error) { setFeedback(error.message || 'Não foi possível criar o cadastro.'); }
    };
    return <main className="public-form-page"><section className="data-card public-form-card"><span className="eyebrow">RELACIONAMENTO COM FORNECEDORES</span><h1>Cadastro de empresa</h1><p>Crie o acesso para acompanhar contratos, ordens de serviço, empenhos e documentos enviados à Câmara.</p><form className="system-fields-grid" onSubmit={submit}><label className="system-field"><span>Razão social *</span><input name="legalName" required value={form.legalName} onChange={change} /></label><label className="system-field"><span>Nome fantasia</span><input name="tradeName" value={form.tradeName} onChange={change} /></label><label className="system-field"><span>CNPJ *</span><input name="cnpj" required value={form.cnpj} onChange={change} placeholder="00.000.000/0001-00" /></label><label className="system-field"><span>Representante legal *</span><input name="representative" required value={form.representative} onChange={change} /></label><label className="system-field"><span>E-mail de acesso *</span><input name="email" type="email" required value={form.email} onChange={change} /></label><label className="system-field"><span>Telefone</span><input name="phone" value={form.phone} onChange={change} /></label><label className="system-field"><span>Senha *</span><input name="password" type="password" minLength="6" required value={form.password} onChange={change} /></label>{feedback && <p className="form-feedback">{feedback}</p>}<button className="btn-primary">Criar acesso da empresa</button></form><Link to="/login">Já possui acesso? Entrar</Link></section></main>;
};
export default CompanyRegistration;
