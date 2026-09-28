// src/config.js
import tenantConfig from './tenant-config.json';

const config = {
    cityCollection: tenantConfig.tenant?.slug || 'exemplo'
};
export default config;
