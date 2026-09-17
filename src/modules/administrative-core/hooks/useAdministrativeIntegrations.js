import { useEffect, useState } from 'react';
import { AdministrativeCommandService } from '../services/AdministrativeCommandService';

export default function useAdministrativeIntegrations(moduleId, source) {
    const [state, setState] = useState({ loading: true, options: {}, error: '' });
    useEffect(() => {
        let active = true;
        AdministrativeCommandService.run(moduleId, 'integrationOptions', { source })
            .then(result => active && setState({ loading: false, options: result.options || {}, error: '' }))
            .catch(error => active && setState({ loading: false, options: {}, error: error.message || '' }));
        return () => { active = false; };
    }, [moduleId, source]);
    return state;
}
