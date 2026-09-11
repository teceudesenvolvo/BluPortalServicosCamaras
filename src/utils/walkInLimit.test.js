import { getWalkInLimit } from './walkInLimit';

test('mantém limite anterior quando não existe configuração', () => {
    expect(getWalkInLimit()).toBe(20);
});
test('permite fechar encaixes e aumentar o limite', () => {
    expect(getWalkInLimit({ dailyLimit: 0 })).toBe(0);
    expect(getWalkInLimit({ dailyLimit: 45 })).toBe(45);
});
test('não aceita limites negativos ou fracionários', () => {
    expect(getWalkInLimit({ dailyLimit: -1 })).toBe(20);
    expect(getWalkInLimit({ dailyLimit: 1.5 })).toBe(20);
});
