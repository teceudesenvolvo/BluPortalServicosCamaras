import { buildSupplierRanking, getComplaintSupplier } from './proconAnalytics';

test('reads supplier fields from current and eProcon records', () => {
    expect(getComplaintSupplier({ companyName: 'Loja A', cnpjEmpresaReclamada: '1' })).toEqual({ name: 'Loja A', cnpj: '1' });
    expect(getComplaintSupplier({ nomeEmpresaReclamada: 'Loja B', cnpj: '2' })).toEqual({ name: 'Loja B', cnpj: '2' });
});

test('ranks suppliers by complaint volume and calculates resolution', () => {
    const result = buildSupplierRanking([
        { companyName: 'Loja A', cnpj: '1', status: 'Finalizada' },
        { companyName: 'Loja A', cnpj: '1', status: 'Em Análise' },
        { companyName: 'Loja B', cnpj: '2', status: 'Em Análise' },
    ]);
    expect(result[0]).toMatchObject({ name: 'Loja A', total: 2, resolved: 1, pending: 1, resolutionRate: 50 });
});

