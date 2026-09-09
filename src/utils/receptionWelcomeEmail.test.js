import { buildReceptionWelcomeEmail, isValidOptionalEmail } from './receptionWelcomeEmail';
test('email is optional but must be valid when provided', () => {
    ['', '  ', ' pessoa@example.com '].forEach(value => expect(isValidOptionalEmail(value)).toBe(true));
    ['pessoa', 'pessoa@', 'a b@example.com'].forEach(value => expect(isValidOptionalEmail(value)).toBe(false));
});
test('welcome contains the public download link and escapes citizen input', () => {
    const email = buildReceptionWelcomeEmail('<img src=x>', 'paraipaba');
    expect(email.html).not.toContain('<img src=x>');
    expect(email.html).toContain('&lt;img src=x&gt;');
    expect(email.html).toContain('https://servicos.camaraparaipaba.ce.gov.br/download-app');
    expect(email.text).toContain('Câmara Municipal de Paraipaba');
});
