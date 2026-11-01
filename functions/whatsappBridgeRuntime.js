const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {GoogleAuth} = require("google-auth-library");
const admin = require("firebase-admin");

const REGION = "us-central1";
const INSTANCE_REGION = "southamerica-east1";
const INSTANCE = "bluportal-whatsapp-bridge-lowcost";
const SERVICE_ACCOUNT =
  "whatsapp-bridge-scheduler@blu-app-camara.iam.gserviceaccount.com";
const API_BASE = `https://run.googleapis.com/v2/projects/${
  process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT
}/locations/${INSTANCE_REGION}/instances/${INSTANCE}`;
const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

/**
 * Reads the current Cloud Run instance state.
 * @param {object} client Authorized Google API client
 * @return {Promise<string>} Instance state
 */
async function getInstanceState(client) {
  const response = await client.request({url: API_BASE, method: "GET"});
  const terminalCondition = response.data && response.data.terminalCondition;
  if (!terminalCondition || terminalCondition.type !== "Running") {
    return "UNKNOWN";
  }
  if (terminalCondition.state === "CONDITION_SUCCEEDED") return "RUNNING";
  if (terminalCondition.state === "CONDITION_FAILED") return "STOPPED";
  return "UNKNOWN";
}

/**
 * Starts or stops the bridge only when its current state differs.
 * @param {boolean} shouldRun Whether at least one service counter is open
 * @return {Promise<string>} Result description
 */
async function setBridgeState(shouldRun) {
  const client = await googleAuth.getClient();
  const state = await getInstanceState(client);
  const desiredState = shouldRun ? "RUNNING" : "STOPPED";
  if (state === desiredState) {
    return shouldRun ? "already_running" : "already_stopped";
  }
  if (state !== "RUNNING" && state !== "STOPPED") {
    throw new Error(
        `Não foi possível determinar o estado da instância: ${state}`,
    );
  }
  const action = shouldRun ? "start" : "stop";
  await client.request({
    url: `${API_BASE}:${action}`,
    method: "POST",
    data: {},
  });
  return `${action}_requested`;
}

/**
 * Keeps the bridge on while at least one real counter session is open.
 * The query avoids acting on stale or out-of-order event payloads.
 */
exports.whatsappBridgeSyncWithCounterSessions = onDocumentWritten({
  document: "atendimento-guiche-relatorios/{sessionId}",
  region: REGION,
  serviceAccount: SERVICE_ACCOUNT,
  retry: true,
  timeoutSeconds: 120,
}, async (event) => {
  const beforeStatus = event.data && event.data.before.exists ?
    event.data.before.data().status : null;
  const afterStatus = event.data && event.data.after.exists ?
    event.data.after.data().status : null;

  // Session metrics may be updated while the counter remains open. Those writes
  // do not change whether the WhatsApp instance should be running.
  if (beforeStatus === afterStatus) return;

  const openSessions = await admin.firestore()
      .collection("atendimento-guiche-relatorios")
      .where("status", "==", "Aberta")
      .limit(1)
      .get();
  const shouldRun = !openSessions.empty;
  const result = await setBridgeState(shouldRun);
  const status = shouldRun ?
    "active_with_open_counter" : "stopped_no_open_counters";

  await admin.firestore().collection("whatsappRuntime").doc("session").set({
    status,
    openCounterSession: shouldRun,
    lastCounterSessionId: event.params.sessionId,
    lastCounterSessionChangeAt: admin.firestore.FieldValue.serverTimestamp(),
    lastInstanceAction: result,
  }, {merge: true});

  console.log("Estado do WhatsApp sincronizado com os guichês.", {
    sessionId: event.params.sessionId,
    openCounterSession: shouldRun,
    result,
  });
});
