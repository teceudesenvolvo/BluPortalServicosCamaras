/* eslint-disable max-len */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const DAY = 86400000;
const text = (value, max = 20000) => String(value || "").trim().slice(0, max);
const fail = (message) => {
  throw new HttpsError("failed-precondition", message);
};

// All e-SIC access passes through this callable. Clients never write audit events.
exports.esic = onCall(async (request) => {
  const db = admin.firestore();
  const data = request.data || {};
  const action = data.action;
  const settings = (await db.doc("system-control/portal").get()).data() || {};
  if (action === "public") return settings.esic || {};
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre para acessar o e-SIC.");
  const uid = request.auth.uid;
  const profile = (await db.doc(`users/${uid}`).get()).data() || {};
  const staff = ["Admin", "Ouvidoria"].includes(profile.tipo) && settings.security?.rolePermissions?.[profile.tipo]?.esic?.admin !== false;
  if (settings.modules?.esic?.[staff ? "admin" : "portal"] === false) fail("O e-SIC está desativado.");
  const requests = db.collection("esic-pedidos");
  const now = Date.now();
  if (action === "config") {
    if (profile.tipo !== "Admin") throw new HttpsError("permission-denied", "Somente administradores.");
    const config = Object.fromEntries(["responsavel", "email", "telefone", "endereco", "horario", "regulamento", "autoridadeRecursal"].map((key) => [key, text(data[key], 500)]));
    await db.doc("system-control/portal").set({esic: config}, {merge: true});
    return config;
  }
  if (action === "stats") {
    if (!staff) throw new HttpsError("permission-denied", "Acesso administrativo necessário.");
    const statuses = ["Recebido", "Em análise", "Respondido", "Em recurso", "Concluído"];
    const totals = await Promise.all(statuses.map(async (status) => [status, (await requests.where("status", "==", status).count().get()).data().count]));
    return Object.fromEntries(totals);
  }
  if (action === "list") {
    let q = staff && data.admin ? requests : requests.where("userId", "==", uid);
    if (data.protocolo) q = q.where("protocolo", "==", text(data.protocolo, 60).toUpperCase());
    if (data.status) q = q.where("status", "==", text(data.status, 40));
    q = q.orderBy("createdAt", "desc").orderBy(admin.firestore.FieldPath.documentId(), "desc");
    if (data.cursor) {
      if (!Number.isFinite(data.cursor.createdAt) || !/^[a-zA-Z0-9]{20}$/.test(data.cursor.id || "")) fail("Página inválida.");
      q = q.startAfter(data.cursor.createdAt, data.cursor.id);
    }
    const snap = await q.limit(25).get();
    return {items: snap.docs.map((doc) => {
      const d = doc.data(); return {id: doc.id, protocolo: d.protocolo, titulo: d.titulo, status: d.status, createdAt: d.createdAt, deadline: d.deadline, responsavel: d.responsavel || "", nome: d.nome};
    }), cursor: snap.size === 25 ? {createdAt: snap.docs[24].data().createdAt, id: snap.docs[24].id} : null};
  }
  if (action === "create") {
    if (!text(data.titulo) || text(data.descricao).length < 20) fail("Informe assunto e descrição com pelo menos 20 caracteres.");
    if (!profile.nome && !request.auth.token.name) fail("Complete seu nome no perfil antes de solicitar.");
    const ref = requests.doc();
    const year = new Date(now).getUTCFullYear();
    const counter = db.doc(`esic-contadores/${year}`);
    return db.runTransaction(async (tx) => {
      const count = ((await tx.get(counter)).data()?.value || 0) + 1;
      const protocolo = `SIC-${year}-${String(count).padStart(6, "0")}`;
      tx.set(counter, {value: count});
      tx.create(ref, {userId: uid, nome: profile.nome || request.auth.token.name, email: request.auth.token.email || "", titulo: text(data.titulo, 200), descricao: text(data.descricao), status: "Recebido", protocolo, createdAt: now, deadline: now + 20 * DAY, prorrogado: false});
      tx.create(ref.collection("historico").doc(), {acao: "Pedido recebido", texto: "Solicitação recebida pelo SIC.", userId: uid, data: now, interno: false});
      return {id: ref.id, protocolo};
    });
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(data.id || "")) fail("Pedido inválido.");
  const ref = requests.doc(data.id);
  if (action === "upload" || action === "download") {
    const snap = await ref.get();
    const item = snap.data();
    if (!item || (!staff && item.userId !== uid)) throw new HttpsError("permission-denied", "Sem acesso ao documento.");
    const bucket = admin.storage().bucket();
    if (action === "download") {
      if (!/^[a-zA-Z0-9]{20}$/.test(data.fileId || "")) fail("Anexo inválido.");
      const file = await ref.collection("anexos").doc(data.fileId).get();
      if (!file.exists) fail("Anexo não encontrado.");
      const [bytes] = await bucket.file(file.data().path).download();
      return {base64: bytes.toString("base64"), name: file.data().name, mime: file.data().mime};
    }
    if (!staff && !["Recebido", "Em análise"].includes(item.status)) fail("O envio de anexos foi encerrado.");
    const bytes = Buffer.from(text(data.base64, 7100000), "base64");
    const mime = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" : bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? "image/jpeg" : "";
    if (!mime || bytes.length > 5*1024*1024 || !bytes.length) fail("Envie PDF, JPG ou PNG com até 5 MB.");
    const name = text(data.name, 150).replace(/[\\/]/g, "_");
    if (!({"application/pdf": /\.pdf$/i, "image/png": /\.png$/i, "image/jpeg": /\.jpe?g$/i})[mime].test(name)) fail("A extensão não corresponde ao conteúdo.");
    const attachment = ref.collection("anexos").doc();
    const path = `esic/${ref.id}/${attachment.id}`;
    await bucket.file(path).save(bytes, {resumable: false, metadata: {contentType: mime, contentDisposition: "attachment", cacheControl: "private, no-store"}});
    try {
      const batch = db.batch();
      batch.create(attachment, {name, mime, path, size: bytes.length, userId: uid, data: now});
      batch.create(ref.collection("historico").doc(), {acao: "Anexo adicionado", texto: name, userId: uid, data: now, interno: false});
      await batch.commit();
    } catch (error) {
      await bucket.file(path).delete().catch(()=>{}); throw error;
    }
    return {ok: true};
  }
  if (action === "detail") {
    const snap = await ref.get();
    if (!snap.exists) fail("Pedido não encontrado.");
    const item = snap.data();
    if (!staff && item.userId !== uid) throw new HttpsError("permission-denied", "Pedido de outro usuário.");
    const history = await ref.collection("historico").orderBy("data").limit(200).get();
    const anexos = await ref.collection("anexos").orderBy("data").limit(100).get();
    return {id: snap.id, ...item, anexos: anexos.docs.map((d)=>({id: d.id, name: d.data().name, size: d.data().size})), historico: history.docs.map((d) => ({id: d.id, ...d.data()})).filter((h) => staff || !h.interno)};
  }
  const allowed = staff ? ["assign", "extend", "respond", "decide", "note"] : ["appeal", "acknowledge"];
  // Staff members also retain citizen rights over their own requests.
  if (!allowed.includes(action) && !["appeal", "acknowledge"].includes(action)) fail("Ação inválida.");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("Pedido não encontrado.");
    const item = snap.data();
    const patch = {updatedAt: now};
    let acao; let message = text(data.texto); let interno = false;
    if (["appeal", "acknowledge"].includes(action)) {
      if (item.userId !== uid) throw new HttpsError("permission-denied", "Pedido de outro usuário.");
      if (item.status !== "Respondido") fail("O pedido ainda não foi respondido.");
      if (action === "acknowledge") {
        if (item.cienciaAt) return {}; patch.cienciaAt = now; acao = "Ciência da resposta"; message = "Resposta consultada pelo solicitante.";
      } else {
        if (!item.cienciaAt || now > item.cienciaAt + 10*DAY) fail("O prazo de recurso é de 10 dias após a ciência.");
        if (message.length < 20) fail("Descreva o recurso em pelo menos 20 caracteres.");
        patch.status = "Em recurso"; patch.deadline = now + 5*DAY; acao = "Recurso apresentado";
      }
    } else {
      if (!staff) throw new HttpsError("permission-denied", "Acesso administrativo necessário.");
      if (!message) fail("Informe o texto ou justificativa.");
      if (action === "assign") {
        patch.responsavel = text(data.responsavel, 150); patch.setor = text(data.setor, 150); if (!patch.responsavel || !patch.setor) fail("Informe responsável e setor."); if (!["Recebido", "Em análise"].includes(item.status)) fail("Pedido não está em análise."); patch.status = "Em análise"; acao = "Distribuição para análise";
      }
      if (action === "extend") {
        if (item.prorrogado || now > item.deadline || !["Recebido", "Em análise"].includes(item.status)) fail("Prorrogação indisponível: permitida uma vez, antes de vencer o prazo inicial."); patch.prorrogado = true; patch.deadline = item.deadline + 10*DAY; acao = "Prazo prorrogado por 10 dias";
      }
      if (action === "respond") {
        if (!["Recebido", "Em análise"].includes(item.status)) fail("Pedido já respondido."); if (!["Acesso concedido", "Acesso parcial", "Acesso negado", "Informação inexistente", "Órgão não competente"].includes(data.resultado)) fail("Selecione o resultado."); patch.resultado = data.resultado; patch.status = "Respondido"; patch.respondidoAt = now; patch.respondidoPor = uid; acao = "Resposta do SIC";
      }
      if (action === "decide") {
        if (item.status !== "Em recurso") fail("Não há recurso pendente."); if (item.respondidoPor === uid) fail("O recurso deve ser decidido por autoridade superior diferente do autor da resposta."); if (!settings.esic?.autoridadeRecursal || request.auth.token.email?.toLowerCase() !== settings.esic.autoridadeRecursal.toLowerCase()) fail("A decisão compete à autoridade recursal configurada."); patch.status = "Concluído"; acao = "Decisão do recurso";
      }
      if (action === "note") {
        acao = "Observação interna"; interno = true;
      }
    }
    tx.update(ref, patch);
    tx.create(ref.collection("historico").doc(), {acao, texto: message, userId: uid, data: now, interno});
    return {ok: true};
  });
});
