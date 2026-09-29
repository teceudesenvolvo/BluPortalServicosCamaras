import React, {useState} from "react";
import {Link} from "react-router-dom";
import {
  LiaArrowLeftSolid,
  LiaCalendarAltSolid,
  LiaCheckCircleSolid,
  LiaClipboardCheckSolid,
  LiaLockSolid,
  LiaSearchSolid,
} from "react-icons/lia";
import {callFirebaseFunction} from "../../services/firebaseApi";

const formatDate = (value) => {
  if (!value) return "Ainda não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ainda não informado";
  return date.toLocaleString("pt-BR", {dateStyle: "short", timeStyle: "short"});
};

export default function AcompanharOuvidoriaPublica() {
  const [protocol, setProtocol] = useState(() =>
    new URLSearchParams(window.location.search).get("protocolo") || "",
  );
  const [manifestation, setManifestation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookup = async (event) => {
    event.preventDefault();
    const value = protocol.trim();
    if (!value) {
      setError("Informe o número de protocolo.");
      return;
    }
    setLoading(true);
    setError("");
    setManifestation(null);
    try {
      const response = await callFirebaseFunction(
          "publicOuvidoriaLookup", {protocol: value},
      );
      setManifestation(response.data);
    } catch (lookupError) {
      console.warn("Falha na consulta pública da Ouvidoria.", lookupError);
      setError(lookupError.code === "functions/not-found" ?
        "Não encontramos uma manifestação com esse protocolo. Confira o número e tente novamente." :
        "Não foi possível consultar agora. Verifique o protocolo e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="ouvidoria-public-shell">
    <header className="ouvidoria-public-header">
      <Link to="/ouvidoria-publica" className="ouvidoria-brand">
        Ouvidoria da Câmara
      </Link>
      <Link to="/ouvidoria-publica">
        <LiaArrowLeftSolid /> Voltar
      </Link>
    </header>
    <section className="ouvidoria-tracking-layout">
      <div className="ouvidoria-tracking-intro">
        <span className="ouvidoria-kicker">CONSULTA PÚBLICA</span>
        <h1>Acompanhe sua manifestação</h1>
        <p>Informe o número recebido ao registrar sua manifestação para
          consultar a situação atual, sem entrar no Portal.</p>
        <div className="ouvidoria-tracking-privacy">
          <LiaLockSolid />
          <span>Por segurança, esta consulta mostra somente o andamento e as
            datas. O protocolo funciona como chave de acesso: mantenha-o
            reservado.</span>
        </div>
      </div>

      <section className="ouvidoria-tracking-card">
        <form onSubmit={lookup}>
          <label htmlFor="ouvidoria-protocol">Número de protocolo</label>
          <input
            id="ouvidoria-protocol"
            value={protocol}
            onChange={(event) => setProtocol(event.target.value)}
            placeholder="OUV-2026-..."
            autoComplete="off"
            required
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            <LiaSearchSolid /> {loading ? "Consultando..." : "Consultar andamento"}
          </button>
        </form>

        {error && <p className="ouvidoria-tracking-error" role="alert">{error}</p>}
        {manifestation && <article className="ouvidoria-tracking-result" aria-live="polite">
          <div className="ouvidoria-tracking-result-heading">
            <LiaCheckCircleSolid />
            <div><span>Protocolo</span><strong>{manifestation.protocolo}</strong></div>
          </div>
          <dl>
            <div><dt>Situação</dt><dd>{manifestation.status}</dd></div>
            <div><dt>Etapa atual</dt><dd>{manifestation.etapaAtual}</dd></div>
            <div><dt><LiaCalendarAltSolid /> Registrada em</dt>
              <dd>{formatDate(manifestation.dataManifestacao)}</dd></div>
            <div><dt><LiaClipboardCheckSolid /> Última atualização</dt>
              <dd>{formatDate(manifestation.ultimaAtualizacao)}</dd></div>
          </dl>
          <p>Esta consulta não exibe o conteúdo do relato nem informações
            pessoais ou internas.</p>
        </article>}
      </section>
    </section>
  </main>;
}
