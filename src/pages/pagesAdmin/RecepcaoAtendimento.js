import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, limit, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import {
    LiaArrowLeftSolid,
    LiaCheckCircleSolid,
    LiaClipboardListSolid,
    LiaPlusSolid,
    LiaPrintSolid,
    LiaSearchSolid,
    LiaTimesSolid,
} from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { auth, firestore } from '../../firebase';
import { printProtocolReceipt } from '../../utils/printReport';

const todayKey = () => new Date().toISOString().slice(0, 10);

const normalizeDate = (value) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [day, month, year] = value.split('/');
        return `${year}-${month}-${day}`;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
};

const getAppointmentDate = (item) => item?.appointmentDate || item?.dadosSolicitacao?.appointmentDate || '';
const getAppointmentTime = (item) => item?.appointmentTime || item?.dadosSolicitacao?.appointmentTime || '';
const getCitizenName = (item) => item?.dadosBeneficiario?.name || item?.dadosUsuario?.name || 'Cidadão';

const createQueueTicket = async ({ protocolo, nome, assunto, appointmentDate, appointmentTime }) => {
    const dateKey = todayKey();
    const counterRef = doc(firestore, 'atendimento-fila-meta', dateKey);
    const queueRef = doc(collection(firestore, 'atendimento-fila'));

    const senha = await runTransaction(firestore, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const next = (counterSnap.exists() ? counterSnap.data().ultimoNumero || 0 : 0) + 1;
        const password = `B${String(next).padStart(3, '0')}`;

        transaction.set(counterRef, { ultimoNumero: next, data: dateKey }, { merge: true });
        transaction.set(queueRef, {
            senha: password,
            protocolo,
            nome,
            assunto,
            appointmentDate,
            appointmentTime,
            status: 'Aguardando',
            criadoEm: new Date(),
            chamadoEm: null,
            criadoPor: auth.currentUser?.email || 'Recepção',
        });

        return password;
    });

    return senha;
};

const RecepcaoAtendimento = () => {
    const navigate = useNavigate();
    const [activeModal, setActiveModal] = useState(null);
    const [requestForm, setRequestForm] = useState({
        assunto: 'Emissão de Documentos',
        tipoDocumento: '',
        nome: '',
        cpf: '',
        telefone: '',
        descricao: '',
    });
    const [appointmentSearch, setAppointmentSearch] = useState('');
    const [appointmentResults, setAppointmentResults] = useState([]);
    const [appointment, setAppointment] = useState(null);
    const [queuePassword, setQueuePassword] = useState('');
    const [loading, setLoading] = useState(false);

    const appointmentIsToday = useMemo(() => {
        if (!appointment) return false;
        return normalizeDate(getAppointmentDate(appointment)) === todayKey();
    }, [appointment]);

    const handleRequestChange = (event) => {
        const { name, value } = event.target;
        setRequestForm(prev => ({ ...prev, [name]: value }));
    };

    const closeModal = () => {
        setActiveModal(null);
        setAppointment(null);
        setAppointmentResults([]);
        setAppointmentSearch('');
        setQueuePassword('');
    };

    const handleCreateRequest = async (event) => {
        event.preventDefault();
        if (!requestForm.nome.trim() || !requestForm.tipoDocumento.trim()) {
            alert('Informe nome e tipo de documento.');
            return;
        }

        setLoading(true);
        try {
            const docRef = doc(collection(firestore, 'balcao-cidadao'));
            const payload = {
                dadosSolicitacao: {
                    assunto: requestForm.assunto,
                    tipoDocumento: requestForm.tipoDocumento,
                    descricao: requestForm.descricao,
                    detalhes: { origem: 'Recepção' },
                },
                dadosUsuario: {
                    identificacao: 'Presencial',
                    id: 'recepcao',
                    name: requestForm.nome,
                    cpf: requestForm.cpf,
                    telefone: requestForm.telefone,
                    phone: requestForm.telefone,
                    email: '',
                },
                dadosBeneficiario: {
                    id: 'proprio',
                    name: requestForm.nome,
                    cpf: requestForm.cpf,
                    phone: requestForm.telefone,
                    parentesco: 'Próprio solicitante',
                },
                userId: 'recepcao',
                status: 'Aguardando Atendimento',
                origem: 'recepcao',
                dataSolicitacao: new Date(),
                ultimaAtualizacao: new Date(),
                deletionTimestamp: null,
            };

            await setDoc(docRef, payload);
            printProtocolReceipt({
                title: 'Comprovante de Solicitação da Recepção',
                protocol: docRef.id,
                status: payload.status,
                createdAt: payload.dataSolicitacao,
                requester: {
                    Nome: requestForm.nome,
                    CPF: requestForm.cpf,
                    Telefone: requestForm.telefone,
                },
                beneficiary: {
                    Nome: requestForm.nome,
                    CPF: requestForm.cpf,
                    Parentesco: 'Próprio solicitante',
                },
                details: {
                    Assunto: requestForm.assunto,
                    'Tipo de Documento': requestForm.tipoDocumento,
                    Observações: requestForm.descricao,
                },
            });

            alert(`Solicitação criada. Protocolo: ${docRef.id}`);
            setRequestForm({ assunto: 'Emissão de Documentos', tipoDocumento: '', nome: '', cpf: '', telefone: '', descricao: '' });
            setActiveModal(null);
        } catch (error) {
            console.error('Erro ao criar solicitação pela recepção:', error);
            alert('Erro ao criar solicitação.');
        } finally {
            setLoading(false);
        }
    };

    const handleFindAppointment = async () => {
        const term = appointmentSearch.trim().toLowerCase();
        if (!term) {
            alert('Informe CPF, e-mail, nome, telefone ou protocolo.');
            return;
        }

        setLoading(true);
        setQueuePassword('');
        setAppointment(null);
        setAppointmentResults([]);

        try {
            const snapshot = await getDocs(query(
                collection(firestore, 'balcao-cidadao'),
                where('status', '==', 'Agendado'),
                limit(500)
            ));

            const results = snapshot.docs
                .map(item => ({ id: item.id, ...item.data() }))
                .filter((item) => {
                    const values = [
                        item.id,
                        item.dadosUsuario?.name,
                        item.dadosUsuario?.email,
                        item.dadosUsuario?.cpf,
                        item.dadosUsuario?.telefone,
                        item.dadosUsuario?.phone,
                        item.dadosBeneficiario?.name,
                        item.dadosBeneficiario?.cpf,
                        item.dadosBeneficiario?.phone,
                        getAppointmentDate(item),
                        getAppointmentTime(item),
                    ].filter(Boolean).join(' ').toLowerCase();

                    return values.includes(term);
                });

            if (!results.length) {
                alert('Nenhum agendamento encontrado com esses dados.');
                return;
            }

            setAppointmentResults(results);
            if (results.length === 1) setAppointment(results[0]);
        } catch (error) {
            console.error('Erro ao buscar agendamentos:', error);
            alert('Erro ao buscar agendamentos.');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmArrival = async () => {
        if (!appointment) return;
        if (!appointmentIsToday) {
            alert('Este agendamento não é para hoje. A confirmação só pode ser feita na data agendada.');
            return;
        }

        setLoading(true);
        try {
            const senha = await createQueueTicket({
                protocolo: appointment.id,
                nome: getCitizenName(appointment),
                assunto: appointment.dadosSolicitacao?.assunto || 'Atendimento',
                appointmentDate: getAppointmentDate(appointment),
                appointmentTime: getAppointmentTime(appointment),
            });

            await updateDoc(doc(firestore, 'balcao-cidadao', appointment.id), {
                statusFila: 'Aguardando Atendimento Presencial',
                senhaAtendimento: senha,
                chegadaRecepcaoEm: new Date(),
                ultimaAtualizacao: new Date(),
            });

            setQueuePassword(senha);
            printProtocolReceipt({
                title: 'Senha de Atendimento Presencial',
                protocol: appointment.id,
                status: `Senha ${senha}`,
                createdAt: new Date(),
                requester: {
                    Nome: appointment.dadosUsuario?.name,
                    CPF: appointment.dadosUsuario?.cpf,
                    Telefone: appointment.dadosUsuario?.phone || appointment.dadosUsuario?.telefone,
                },
                beneficiary: {
                    Nome: getCitizenName(appointment),
                    CPF: appointment.dadosBeneficiario?.cpf || appointment.dadosUsuario?.cpf,
                    Parentesco: appointment.dadosBeneficiario?.parentesco || 'Próprio solicitante',
                },
                details: {
                    Senha: senha,
                    Assunto: appointment.dadosSolicitacao?.assunto,
                    'Data Agendada': getAppointmentDate(appointment),
                    'Horário Agendado': getAppointmentTime(appointment),
                },
            });
        } catch (error) {
            console.error('Erro ao confirmar chegada:', error);
            alert('Erro ao gerar senha de atendimento.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <button onClick={() => navigate('/admin-balcao')} className="btn-secondary" style={{ marginBottom: 10 }}>
                            <LiaArrowLeftSolid /> Voltar
                        </button>
                        <h1>Recepção</h1>
                        <p>Confirmação presencial de agendamentos e criação assistida de solicitações.</p>
                    </div>
                    <div className="admin-balcao-header-actions">
                        <button onClick={() => navigate('/painel-atendimento')} className="admin-action-button action-queue">
                            <LiaClipboardListSolid />
                            <span className="admin-action-label">Ver Painel da Fila</span>
                        </button>
                    </div>
                </header>

                <section className="reception-kiosk-actions">
                    <button type="button" className="reception-kiosk-button confirm" onClick={() => setActiveModal('confirm')}>
                        <LiaCheckCircleSolid />
                        <strong>Confirmar Agendamento</strong>
                        <span>Buscar por CPF, e-mail, nome, telefone ou protocolo e gerar senha da fila.</span>
                    </button>

                    <button type="button" className="reception-kiosk-button create" onClick={() => setActiveModal('create')}>
                        <LiaPlusSolid />
                        <strong>Criar Nova Solicitação</strong>
                        <span>Registrar atendimento presencial e imprimir o comprovante com protocolo.</span>
                    </button>
                </section>

                {activeModal === 'create' && (
                    <div className="modal-overlay">
                        <div className="modal-content reception-modal-content">
                            <div className="modal-header">
                                <h3><LiaPlusSolid /> Criar Solicitação</h3>
                                <button type="button" className="modal-close-btn" onClick={closeModal}><LiaTimesSolid /></button>
                            </div>
                            <form className="reception-modal-form" onSubmit={handleCreateRequest}>
                                <div className="form-group">
                                    <label>Assunto</label>
                                    <select name="assunto" value={requestForm.assunto} onChange={handleRequestChange} className="form-input">
                                        <option value="Emissão de Documentos">Emissão de Documentos</option>
                                        <option value="Entrega de Documentos">Entrega de Documentos</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Tipo de Documento</label>
                                    <input name="tipoDocumento" value={requestForm.tipoDocumento} onChange={handleRequestChange} className="form-input" />
                                </div>
                                <div className="form-group">
                                    <label>Nome</label>
                                    <input name="nome" value={requestForm.nome} onChange={handleRequestChange} className="form-input" />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>CPF</label>
                                        <input name="cpf" value={requestForm.cpf} onChange={handleRequestChange} className="form-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Telefone</label>
                                        <input name="telefone" value={requestForm.telefone} onChange={handleRequestChange} className="form-input" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Observações</label>
                                    <textarea name="descricao" value={requestForm.descricao} onChange={handleRequestChange} className="form-input" rows="3" />
                                </div>
                                <button className="btn-primary btn-save-status" disabled={loading}>
                                    <LiaPrintSolid /> Criar e Imprimir
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {activeModal === 'confirm' && (
                    <div className="modal-overlay">
                        <div className="modal-content reception-modal-content">
                            <div className="modal-header">
                                <h3><LiaCheckCircleSolid /> Confirmar Agendamento</h3>
                                <button type="button" className="modal-close-btn" onClick={closeModal}><LiaTimesSolid /></button>
                            </div>

                            <div className="reception-search-row">
                                <div className="form-group">
                                    <label>Buscar agendamento</label>
                                    <input
                                        value={appointmentSearch}
                                        onChange={(event) => setAppointmentSearch(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') handleFindAppointment();
                                        }}
                                        className="form-input"
                                        placeholder="CPF, e-mail, nome, telefone ou protocolo"
                                    />
                                </div>
                                <button onClick={handleFindAppointment} className="btn-secondary" disabled={loading}>
                                    <LiaSearchSolid /> Buscar
                                </button>
                            </div>

                            {appointmentResults.length > 1 && (
                                <div className="appointment-result-list">
                                    {appointmentResults.map(result => (
                                        <button
                                            type="button"
                                            key={result.id}
                                            className={appointment?.id === result.id ? 'active' : ''}
                                            onClick={() => setAppointment(result)}
                                        >
                                            <strong>{getCitizenName(result)}</strong>
                                            <span>{result.id} • {getAppointmentDate(result) || 'Sem data'} • {getAppointmentTime(result) || 'Sem horário'}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {appointment && (
                                <div className="selected-appointment-card">
                                    <div>
                                        <strong>{getCitizenName(appointment)}</strong>
                                        <span>Protocolo: {appointment.id}</span>
                                    </div>
                                    <p>Status: {appointment.status || 'Sem status'}</p>
                                    <p>Data: {getAppointmentDate(appointment) || 'Não informado'}</p>
                                    <p>Horário: {getAppointmentTime(appointment) || 'Não informado'}</p>
                                    {!appointmentIsToday && (
                                        <div className="appointment-warning">
                                            Este agendamento não é para hoje. A confirmação presencial está bloqueada.
                                        </div>
                                    )}
                                    <button onClick={handleConfirmArrival} className="btn-primary btn-save-status" disabled={loading || !appointmentIsToday}>
                                        Confirmar Chegada e Gerar Senha
                                    </button>
                                </div>
                            )}

                            {queuePassword && (
                                <div className="queue-password-card">
                                    <span>Senha gerada</span>
                                    <strong>{queuePassword}</strong>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecepcaoAtendimento;
