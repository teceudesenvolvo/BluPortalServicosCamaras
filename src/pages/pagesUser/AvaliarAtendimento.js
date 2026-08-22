import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { LiaArrowLeftSolid, LiaCheckCircleSolid, LiaStarSolid } from 'react-icons/lia';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { firestore } from '../../firebase';

const stars = [1, 2, 3, 4, 5];

const AvaliarAtendimento = () => {
    const navigate = useNavigate();
    const { protocolo } = useParams();
    const { currentUser } = useAuth();
    const [solicitacao, setSolicitacao] = useState(null);
    const [attendanceRating, setAttendanceRating] = useState(0);
    const [serviceRating, setServiceRating] = useState(0);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!currentUser || !protocolo) return;
            setLoading(true);
            try {
                const [requestSnap, reviewSnap] = await Promise.all([
                    getDoc(doc(firestore, 'balcao-cidadao', protocolo)),
                    getDoc(doc(firestore, 'atendimento-avaliacoes', `${protocolo}_${currentUser.uid}`)),
                ]);

                if (!requestSnap.exists()) {
                    setSolicitacao(null);
                    return;
                }

                const requestData = requestSnap.data() || {};
                const attendanceFinished = Boolean(requestData.atendimentoPresencialConcluidoEm)
                    || requestData.statusFila === 'Atendimento Presencial Concluído';
                if (requestData.userId !== currentUser.uid || !attendanceFinished) {
                    setSolicitacao(null);
                    return;
                }

                setSolicitacao({ id: requestSnap.id, ...requestData });
                if (reviewSnap.exists()) {
                    const review = reviewSnap.data() || {};
                    setAttendanceRating(review.notaAtendimento || review.nota || 0);
                    setServiceRating(review.notaServico || review.nota || 0);
                    setComment(review.comentario || '');
                    setSaved(true);
                }
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [currentUser, protocolo]);

    const handleSubmit = async () => {
        if (!currentUser || !solicitacao) return;
        if (!attendanceRating || !serviceRating) {
            alert('Avalie o atendimento e o serviço para continuar.');
            return;
        }

        setSaving(true);
        try {
            const reviewData = {
                protocolo,
                userId: currentUser.uid,
                nota: attendanceRating,
                notaAtendimento: attendanceRating,
                notaServico: serviceRating,
                comentario: comment.trim(),
                setor: 'Balcão do Cidadão',
                assunto: solicitacao.dadosSolicitacao?.assunto || '',
                statusSolicitacao: solicitacao.status || '',
                atendenteUid: solicitacao.atendenteUid || '',
                atendenteNome: solicitacao.atendenteNome || '',
                guicheAtendimento: solicitacao.guicheAtendimento || '',
                sessaoGuicheId: solicitacao.sessaoGuicheId || '',
                updatedAt: serverTimestamp(),
            };
            if (!saved) reviewData.createdAt = serverTimestamp();
            await setDoc(doc(collection(firestore, 'atendimento-avaliacoes'), `${protocolo}_${currentUser.uid}`), reviewData, { merge: true });
            setSaved(true);
            alert('Avaliação registrada com sucesso.');
        } catch (error) {
            console.error('Erro ao salvar avaliação:', error);
            alert('Não foi possível salvar a avaliação.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={(path) => navigate(path)} />
            <div className="dashboard-content profile-page-content">
                <header className="content-header profile-page-header">
                    <div className="header-title-section">
                        <span className="user-dashboard-eyebrow">Avaliação</span>
                        <h1>Como foi o seu atendimento?</h1>
                        <p>Seu retorno nos ajuda a melhorar o atendimento presencial da Câmara.</p>
                    </div>
                </header>

                <div className="profile-container modern-profile-container">
                    <div className="profile-actions" style={{ justifyContent: 'space-between' }}>
                        <button className="btn-secondary" onClick={() => navigate('/balcao')}>
                            <LiaArrowLeftSolid size={18} /> Voltar para o Balcão
                        </button>
                        {saved && (
                            <span className="status-pill status-success">
                                <LiaCheckCircleSolid size={18} /> Avaliação registrada
                            </span>
                        )}
                    </div>

                    {loading ? (
                        <div className="loading-full-screen" style={{ minHeight: '240px', background: 'transparent' }}>Carregando avaliação...</div>
                    ) : !solicitacao ? (
                        <div className="data-card">
                            <div className="card-header"><h3>Avaliação indisponível</h3></div>
                            <p>Não encontramos uma solicitação válida para este protocolo.</p>
                        </div>
                    ) : (
                        <div className="data-sections-grid">
                            <div className="data-card">
                                <div className="card-header"><h3>Resumo do atendimento</h3></div>
                                <div className="data-item"><strong>Protocolo:</strong><span>{protocolo}</span></div>
                                <div className="data-item"><strong>Assunto:</strong><span>{solicitacao.dadosSolicitacao?.assunto || 'Atendimento presencial'}</span></div>
                                <div className="data-item"><strong>Status atual:</strong><span>{solicitacao.status || 'N/A'}</span></div>
                            </div>

                            <div className="data-card">
                                <div className="card-header"><h3>Sua avaliação</h3></div>
                                <RatingField label="Atendimento do servidor" value={attendanceRating} onChange={setAttendanceRating} />
                                <RatingField label="Qualidade do serviço recebido" value={serviceRating} onChange={setServiceRating} />
                                <div className="form-group" style={{ marginTop: '20px' }}>
                                    <label>Comentário</label>
                                    <textarea
                                        className="form-input"
                                        rows="5"
                                        value={comment}
                                        onChange={(event) => setComment(event.target.value)}
                                        placeholder="Conte rapidamente como foi seu atendimento."
                                    />
                                </div>
                                <div className="profile-actions" style={{ justifyContent: 'flex-end' }}>
                                    <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
                                        {saving ? 'Salvando...' : saved ? 'Atualizar avaliação' : 'Enviar avaliação'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const RatingField = ({ label, value, onChange }) => (
    <fieldset className="service-rating-field">
        <legend>{label}</legend>
        <div className="service-rating-stars" role="radiogroup" aria-label={label}>
            {stars.map((star) => (
                <button
                    key={star}
                    type="button"
                    className={star <= value ? 'selected' : ''}
                    onClick={() => onChange(star)}
                    role="radio"
                    aria-checked={value === star}
                    aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
                >
                    <LiaStarSolid />
                </button>
            ))}
            <span>{value ? `${value} de 5` : 'Selecione uma nota'}</span>
        </div>
    </fieldset>
);

export default AvaliarAtendimento;
