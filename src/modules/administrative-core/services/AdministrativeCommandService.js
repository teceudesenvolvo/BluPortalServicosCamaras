import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';

const execute = httpsCallable(functions, 'administrativeCommand');

export const AdministrativeCommandService = {
    run(moduleId, action, payload = {}) {
        return execute({ moduleId, action, payload }).then(result => result.data).catch(error => {
            const code = String(error?.code || '').replace('functions/', '');
            const details = error?.details ? ` ${String(error.details)}` : '';
            const message = error?.message || 'Não foi possível concluir a operação.';
            const enriched = new Error(`${message}${details}`);
            enriched.code = code;
            enriched.original = error;
            console.error(`Erro em administrativeCommand (${moduleId}.${action})`, error);
            throw enriched;
        });
    },
};
