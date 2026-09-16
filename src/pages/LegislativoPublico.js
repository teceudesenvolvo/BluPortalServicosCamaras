import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { LiaCalendarAltSolid, LiaFileAltSolid, LiaGavelSolid } from 'react-icons/lia';
import { firestore } from '../firebase';
import { LEGISLATIVE_COLLECTIONS } from '../config/legislativeDataModel';

export default function LegislativoPublico() {
  const [documents, setDocuments] = useState([]);
  const [minutes, setMinutes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const stopDocuments = onSnapshot(query(collection(firestore, LEGISLATIVE_COLLECTIONS.documents), where('public', '==', true)), snapshot => setDocuments(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => setError('As publicações legislativas estão sendo atualizadas.'));
    const stopMinutes = onSnapshot(query(collection(firestore, LEGISLATIVE_COLLECTIONS.minutes), where('public', '==', true)), snapshot => setMinutes(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => setError('As atas públicas estão sendo atualizadas.'));
    return () => { stopDocuments(); stopMinutes(); };
  }, []);

  return <main className="legislative-public-shell">
    <header className="legislative-public-header"><Link to="/">Portal da Câmara</Link><nav><Link to="/ouvidoria-publica">Ouvidoria</Link><Link to="/esic-publico">e-SIC</Link></nav></header>
    <section className="legislative-public-hero"><span>TRANSPARÊNCIA LEGISLATIVA</span><h1>Acompanhe o trabalho legislativo</h1><p>Consulte documentos oficiais e atas publicadas pela Câmara Municipal.</p></section>
    {error && <p className="legislative-public-feedback">{error}</p>}
    <section className="legislative-public-grid">
      <article><div className="legislative-public-heading"><LiaFileAltSolid /><div><h2>Documentos oficiais</h2><p>Autógrafos, redações finais, pareceres e publicações.</p></div></div><div className="legislative-public-list">{documents.map(item => <div key={item.id}><strong>{item.title}</strong><span>{item.type} · {item.summary || 'Documento legislativo publicado.'}</span></div>)}{!documents.length && <p>Nenhum documento publicado no momento.</p>}</div></article>
      <article><div className="legislative-public-heading"><LiaCalendarAltSolid /><div><h2>Atas das sessões</h2><p>Registros formais das sessões plenárias.</p></div></div><div className="legislative-public-list">{minutes.map(item => <div key={item.id}><strong>{item.title}</strong><span>{item.sessionTitle} · {item.summary || 'Ata publicada.'}</span></div>)}{!minutes.length && <p>Nenhuma ata publicada no momento.</p>}</div></article>
    </section>
    <section className="legislative-public-note"><LiaGavelSolid /><div><strong>Dados atualizados pela Secretaria Legislativa</strong><p>Informações em elaboração ou ainda não publicadas não aparecem nesta página.</p></div></section>
  </main>;
}
