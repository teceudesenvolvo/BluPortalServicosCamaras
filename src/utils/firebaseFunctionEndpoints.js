import firebaseApp from '../firebase';

const functionsRegion = process.env.REACT_APP_FUNCTIONS_REGION || 'us-central1';
const configuredBaseUrl = process.env.REACT_APP_FUNCTIONS_BASE_URL?.trim().replace(/\/$/, '');
const projectId = firebaseApp.options.projectId;

export const appFunctionsBaseUrl = configuredBaseUrl || (projectId
    ? `https://${functionsRegion}-${projectId}.cloudfunctions.net`
    : '');

export const functionEndpoint = (name) => (
    appFunctionsBaseUrl ? `${appFunctionsBaseUrl}/${name}` : ''
);
