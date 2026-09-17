const {onCall} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const {createCommandRunner} = require("./command");
const {contractHandlers} = require("./contracts");
const {inventoryHandlers} = require("./inventory");
const {assetsHandlers} = require("./assets");
const {maintenanceHandlers} = require("./maintenance");
const {fleetHandlers} = require("./fleet");
const {integrationHandlers} = require("./integrations");
const {sweepAdministrativeAlerts} = require("./alerts");
const {reportHandlers} = require("./reports");

const withAlerts = (handlers) => ({
  ...handlers,
  runAlerts: {
    permission: "contratos.gerenciar",
    execute: ({db, settings}) => sweepAdministrativeAlerts(db, settings),
  },
});

// Os handlers de cada domínio serão registrados nas próximas fases. Manter um
// único endpoint impede que autorização, auditoria e convenções de erro sejam
// reimplementadas por cada tela.
const handlers = {
  contratos: withAlerts({
    ...contractHandlers,
    ...integrationHandlers("contratos"),
    ...reportHandlers("contratos"),
  }),
  almoxarifado: {
    ...inventoryHandlers,
    ...integrationHandlers("almoxarifado"),
    ...reportHandlers("almoxarifado"),
  },
  patrimonio: {
    ...assetsHandlers,
    ...integrationHandlers("patrimonio"),
    ...reportHandlers("patrimonio"),
  },
  manutencao: {
    ...maintenanceHandlers,
    ...integrationHandlers("manutencao"),
    ...reportHandlers("manutencao"),
  },
  frotas: {
    ...fleetHandlers,
    ...integrationHandlers("frotas"),
    ...reportHandlers("frotas"),
  },
};

exports.administrativeCommand = onCall(
    {cors: true},
    createCommandRunner({db: admin.firestore(), handlers}),
);

exports.administrativeDailyAlerts = onSchedule(
    {schedule: "every day 08:00", timeZone: "America/Fortaleza"},
    async () => {
      const settingsSnapshot = await admin.firestore()
          .collection("system-control").doc("portal").get();
      const settings = settingsSnapshot.data() || {};
      return sweepAdministrativeAlerts(admin.firestore(), settings);
    },
);
