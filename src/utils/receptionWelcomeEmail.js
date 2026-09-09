const DOWNLOAD_URL = 'https://servicos.camaraparaipaba.ce.gov.br/download-app';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const isValidOptionalEmail = (email = '') => !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const buildReceptionWelcomeEmail = (name, city) => {
    const cityName = city.charAt(0).toUpperCase() + city.slice(1);
    return {
        subject: `Boas-vindas à Câmara Municipal de ${cityName}`,
        text: `Olá, ${name}! Seja bem-vindo(a) à Câmara Municipal de ${cityName}. Seu atendimento presencial foi registrado. Pelo aplicativo da Câmara, você poderá acompanhar os serviços, receber novidades e ficar por dentro das atividades da Câmara. Baixe o aplicativo: ${DOWNLOAD_URL}`,
        html: `<div style="font-family:Arial,sans-serif;color:#10233f;line-height:1.6;max-width:600px;margin:auto;padding:24px">
            <h2>Boas-vindas à Câmara Municipal de ${escapeHtml(cityName)}!</h2>
            <p>Olá, ${escapeHtml(name)}!</p>
            <p>Seu atendimento presencial foi registrado. É um prazer receber você.</p>
            <p>Com o aplicativo da Câmara, você poderá acompanhar os serviços, receber novidades e ficar por dentro das atividades da Câmara, onde estiver.</p>
            <p>Clique no botão abaixo para baixar o aplicativo no seu celular:</p>
            <p style="margin:24px 0"><a href="${DOWNLOAD_URL}" style="display:inline-block;background:#025aa1;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Baixar aplicativo da Câmara</a></p>
            <p>Se o botão não abrir, acesse: <a href="${DOWNLOAD_URL}">${DOWNLOAD_URL}</a></p>
            <p>Conte com a gente!<br><strong>Câmara Municipal de ${escapeHtml(cityName)}</strong></p>
        </div>`,
    };
};
