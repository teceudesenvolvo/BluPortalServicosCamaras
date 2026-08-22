import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { LiaChartBarSolid, LiaSearchSolid, LiaStarSolid, LiaUserTieSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { firestore } from '../../firebase';

const toDate = (value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const average = (total, count) => count ? total / count : 0;
const formatScore = (score) => score.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const AdminAvaliacoes = () => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [period, setPeriod] = useState('all');

    useEffect(() => {
        const loadReviews = async () => {
            setLoading(true);
            setError('');
            try {
                const snapshot = await getDocs(query(collection(firestore, 'atendimento-avaliacoes'), orderBy('updatedAt', 'desc')));
                setReviews(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
            } catch (loadError) {
                console.error('Erro ao carregar avaliações:', loadError);
                setError('Não foi possível carregar as avaliações.');
            } finally {
                setLoading(false);
            }
        };
        loadReviews();
    }, []);

    const filteredReviews = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
        const cutoff = period === 'all' ? null : new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000);
        return reviews.filter((review) => {
            const reviewDate = toDate(review.updatedAt || review.createdAt);
            const matchesPeriod = !cutoff || (reviewDate && reviewDate >= cutoff);
            const haystack = `${review.atendenteNome || ''} ${review.setor || ''} ${review.assunto || ''}`.toLocaleLowerCase('pt-BR');
            return matchesPeriod && (!normalizedSearch || haystack.includes(normalizedSearch));
        });
    }, [period, reviews, search]);

    const ranking = useMemo(() => {
        const attendants = new Map();
        filteredReviews.forEach((review) => {
            const key = review.atendenteUid || review.atendenteNome || 'nao-identificado';
            const current = attendants.get(key) || {
                id: key,
                name: review.atendenteNome || 'Atendente não identificado',
                attendanceTotal: 0,
                serviceTotal: 0,
                count: 0,
                comments: 0,
            };
            current.attendanceTotal += Number(review.notaAtendimento || review.nota || 0);
            current.serviceTotal += Number(review.notaServico || review.nota || 0);
            current.count += 1;
            current.comments += review.comentario?.trim() ? 1 : 0;
            attendants.set(key, current);
        });
        return [...attendants.values()].map((item) => {
            const attendanceAverage = average(item.attendanceTotal, item.count);
            const serviceAverage = average(item.serviceTotal, item.count);
            return { ...item, attendanceAverage, serviceAverage, overallAverage: (attendanceAverage + serviceAverage) / 2 };
        }).sort((a, b) => b.overallAverage - a.overallAverage || b.count - a.count || a.name.localeCompare(b.name));
    }, [filteredReviews]);

    const summary = useMemo(() => {
        const attendanceTotal = filteredReviews.reduce((sum, item) => sum + Number(item.notaAtendimento || item.nota || 0), 0);
        const serviceTotal = filteredReviews.reduce((sum, item) => sum + Number(item.notaServico || item.nota || 0), 0);
        return {
            count: filteredReviews.length,
            attendance: average(attendanceTotal, filteredReviews.length),
            service: average(serviceTotal, filteredReviews.length),
        };
    }, [filteredReviews]);

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <main className="dashboard-content service-reviews-page">
                <header className="service-reviews-header">
                    <div>
                        <span className="user-dashboard-eyebrow">Qualidade do atendimento</span>
                        <h1>Avaliações e ranking</h1>
                        <p>Acompanhe a percepção dos cidadãos sobre o atendimento e os serviços prestados.</p>
                    </div>
                </header>

                <section className="service-reviews-metrics" aria-label="Resumo das avaliações">
                    <article><LiaChartBarSolid /><span>Avaliações</span><strong>{summary.count}</strong></article>
                    <article><LiaUserTieSolid /><span>Média do atendimento</span><strong>{formatScore(summary.attendance)}</strong></article>
                    <article><LiaStarSolid /><span>Média do serviço</span><strong>{formatScore(summary.service)}</strong></article>
                </section>

                <section className="service-reviews-panel">
                    <div className="service-reviews-filters">
                        <label className="service-reviews-search"><LiaSearchSolid /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar atendente, setor ou serviço" /></label>
                        <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período">
                            <option value="all">Todo o período</option>
                            <option value="30">Últimos 30 dias</option>
                            <option value="90">Últimos 90 dias</option>
                            <option value="365">Últimos 12 meses</option>
                        </select>
                    </div>

                    {loading ? <div className="service-reviews-state">Carregando avaliações...</div> : error ? <div className="service-reviews-state error">{error}</div> : ranking.length === 0 ? <div className="service-reviews-state">Nenhuma avaliação encontrada.</div> : (
                        <div className="service-ranking-table-wrap">
                            <table className="service-ranking-table">
                                <thead><tr><th>Posição</th><th>Atendente</th><th>Avaliações</th><th>Atendimento</th><th>Serviço</th><th>Média geral</th></tr></thead>
                                <tbody>{ranking.map((item, index) => (
                                    <tr key={item.id}>
                                        <td><span className={`service-ranking-position position-${index + 1}`}>{index + 1}º</span></td>
                                        <td><strong>{item.name}</strong><small>{item.comments} comentário(s)</small></td>
                                        <td>{item.count}</td>
                                        <td>{formatScore(item.attendanceAverage)}</td>
                                        <td>{formatScore(item.serviceAverage)}</td>
                                        <td><span className="service-ranking-score"><LiaStarSolid /> {formatScore(item.overallAverage)}</span></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default AdminAvaliacoes;
