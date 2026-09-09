const normalize = (value = '') => String(value).trim().toLocaleLowerCase('pt-BR');

export const getComplaintSupplier = (complaint = {}) => ({
    name: complaint.companyName || complaint.nomeEmpresaReclamada || complaint.empresaInfo?.razao_social || complaint.fornecedorNome || 'Fornecedor não informado',
    cnpj: complaint.cnpjEmpresaReclamada || complaint.cnpj || complaint.empresaInfo?.cnpj || complaint.fornecedorCnpj || '',
});

export const buildSupplierRanking = (complaints = []) => {
    const grouped = new Map();
    complaints.forEach(complaint => {
        const supplier = getComplaintSupplier(complaint);
        const key = supplier.cnpj || normalize(supplier.name);
        if (!key || supplier.name === 'Fornecedor não informado') return;
        const current = grouped.get(key) || { key, name: supplier.name, cnpj: supplier.cnpj, total: 0, resolved: 0, pending: 0 };
        current.total += 1;
        if (['Finalizada', 'Concluído', 'Resolvida', 'Arquivada'].includes(complaint.status || complaint.situacao)) current.resolved += 1;
        else current.pending += 1;
        grouped.set(key, current);
    });
    return [...grouped.values()]
        .map(item => ({ ...item, resolutionRate: item.total ? Math.round((item.resolved / item.total) * 100) : 0 }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
};

