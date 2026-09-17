import { useAuth } from '../../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../../contexts/SystemControlContext';
import { canPerformAction } from '../../../config/rolePermissions';

export default function PermissionGate({ permission, children, fallback = null }) {
    const { currentUser, role } = useAuth();
    const { settings } = useSystemControl();
    return canPerformAction(settings, role, currentUser?.email, permission) ? children : fallback;
}
