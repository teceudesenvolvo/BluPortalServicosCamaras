import Logo from '../assets/logo-paraipaba.png';

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatGeneratedAt = () => new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
}).format(new Date());

export const printTableReport = ({ title, subtitle, columns, rows }) => {
    const printWindow = window.open('', '_blank', 'width=1200,height=800');

    if (!printWindow) {
        alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups do navegador.');
        return;
    }

    const tableRows = rows.length > 0
        ? rows.map((row, index) => `
            <tr>
                ${columns.map((column) => `<td>${escapeHtml(column.render ? column.render(row, index) : row[column.key])}</td>`).join('')}
            </tr>
        `).join('')
        : `<tr><td colspan="${columns.length}" class="empty">Nenhum resultado encontrado para os filtros atuais.</td></tr>`;

    printWindow.document.write(`
        <!doctype html>
        <html lang="pt-BR">
            <head>
                <meta charset="utf-8" />
                <title>${escapeHtml(title)}</title>
                <style>
                    @page { size: A4 landscape; margin: 12mm; }
                    * { box-sizing: border-box; }
                    body {
                        margin: 0;
                        color: #10233f;
                        font-family: Arial, Helvetica, sans-serif;
                        background: #ffffff;
                    }
                    .report-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        gap: 24px;
                        padding-bottom: 14px;
                        margin-bottom: 16px;
                        border-bottom: 3px solid #025AA1;
                    }
                    .brand {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        min-width: 0;
                    }
                    .brand img {
                        width: 58px;
                        height: 58px;
                        object-fit: contain;
                    }
                    h1 {
                        margin: 0;
                        color: #01477e;
                        font-size: 22px;
                    }
                    .subtitle {
                        margin: 6px 0 0;
                        color: #475569;
                        font-size: 12px;
                        line-height: 1.4;
                    }
                    .meta {
                        text-align: right;
                        color: #64748b;
                        font-size: 11px;
                        white-space: nowrap;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                        font-size: 10px;
                    }
                    th {
                        background: #01477e;
                        color: #ffffff;
                        text-align: left;
                        padding: 8px 7px;
                        border: 1px solid #0b3f6e;
                        font-size: 10px;
                    }
                    td {
                        vertical-align: top;
                        padding: 7px;
                        border: 1px solid #cbd5e1;
                        color: #1f2937;
                        line-height: 1.35;
                        word-break: break-word;
                    }
                    tbody tr:nth-child(even) td { background: #f5f9ff; }
                    .report-footer {
                        margin-top: 16px;
                        padding-top: 10px;
                        border-top: 1px solid #cbd5e1;
                        text-align: center;
                        color: #64748b;
                        font-size: 11px;
                        font-weight: 700;
                    }
                    .empty {
                        padding: 24px;
                        text-align: center;
                        color: #64748b;
                    }
                    .print-actions {
                        position: sticky;
                        top: 0;
                        display: flex;
                        justify-content: flex-end;
                        gap: 8px;
                        padding: 10px 0;
                        margin-bottom: 8px;
                        background: #ffffff;
                    }
                    .print-actions button {
                        border: 0;
                        border-radius: 8px;
                        padding: 9px 14px;
                        background: #025AA1;
                        color: #ffffff;
                        font-weight: 700;
                        cursor: pointer;
                    }
                    .print-actions button.secondary {
                        background: #e2e8f0;
                        color: #10233f;
                    }
                    @media print {
                        .print-actions { display: none; }
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="print-actions">
                    <button onclick="window.print()">Imprimir / Salvar PDF</button>
                    <button class="secondary" onclick="window.close()">Fechar</button>
                </div>
                <header class="report-header">
                    <div class="brand">
                        <img src="${Logo}" alt="Câmara Municipal de Paraipaba" />
                        <div>
                            <h1>${escapeHtml(title)}</h1>
                            <p class="subtitle">${escapeHtml(subtitle || '')}</p>
                        </div>
                    </div>
                    <div class="meta">
                        <strong>${rows.length}</strong> resultado${rows.length === 1 ? '' : 's'}<br />
                        Gerado em ${escapeHtml(formatGeneratedAt())}
                    </div>
                </header>
                <table>
                    <thead>
                        <tr>
                            ${columns.map((column) => `<th style="width:${column.width || 'auto'}">${escapeHtml(column.label)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <footer class="report-footer">Camara AI - Desenvolvido por Blu Tecnologias</footer>
            </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();
};

const renderValue = (value) => {
    if (value === null || value === undefined || value === '') return 'Não informado';
    if (value instanceof Date) return value.toLocaleString('pt-BR');
    if (typeof value?.toDate === 'function') return value.toDate().toLocaleString('pt-BR');
    if (Array.isArray(value)) return value.map(renderValue).join(', ');
    if (typeof value === 'object') {
        return Object.entries(value)
            .filter(([, nestedValue]) => nestedValue !== undefined && nestedValue !== null && nestedValue !== '')
            .map(([key, nestedValue]) => `${key}: ${renderValue(nestedValue)}`)
            .join('; ') || 'Não informado';
    }
    return String(value);
};

export const printProtocolReceipt = ({ title, protocol, status, requester, beneficiary, details, createdAt }) => {
    const printWindow = window.open('', '_blank', 'width=900,height=800');

    if (!printWindow) {
        alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups do navegador.');
        return;
    }

    const sections = [
        { title: 'Dados do Solicitante', rows: requester || {} },
        { title: 'Dados do Beneficiário', rows: beneficiary || {} },
        { title: 'Informações da Solicitação', rows: details || {} },
    ];

    printWindow.document.write(`
        <!doctype html>
        <html lang="pt-BR">
            <head>
                <meta charset="utf-8" />
                <title>${escapeHtml(title || 'Comprovante de Solicitação')}</title>
                <style>
                    @page { size: A4 portrait; margin: 14mm; }
                    * { box-sizing: border-box; }
                    body {
                        margin: 0;
                        color: #10233f;
                        font-family: Arial, Helvetica, sans-serif;
                        background: #ffffff;
                    }
                    .print-actions {
                        position: sticky;
                        top: 0;
                        display: flex;
                        justify-content: flex-end;
                        gap: 8px;
                        padding: 10px 0;
                        margin-bottom: 10px;
                        background: #ffffff;
                    }
                    .print-actions button {
                        border: 0;
                        border-radius: 8px;
                        padding: 9px 14px;
                        background: #025AA1;
                        color: #ffffff;
                        font-weight: 700;
                        cursor: pointer;
                    }
                    .print-actions button.secondary {
                        background: #e2e8f0;
                        color: #10233f;
                    }
                    .receipt {
                        border: 1px solid #cbd5e1;
                        border-radius: 18px;
                        overflow: hidden;
                    }
                    header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        gap: 18px;
                        padding: 22px;
                        background: linear-gradient(135deg, #f5f9ff 0%, #ffffff 100%);
                        border-bottom: 4px solid #025AA1;
                    }
                    .brand {
                        display: flex;
                        align-items: center;
                        gap: 14px;
                    }
                    .brand img {
                        width: 64px;
                        height: 64px;
                        object-fit: contain;
                    }
                    h1 {
                        margin: 0;
                        color: #01477e;
                        font-size: 24px;
                    }
                    .subtitle {
                        margin: 6px 0 0;
                        color: #64748b;
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .protocol {
                        text-align: right;
                        color: #10233f;
                        font-size: 12px;
                    }
                    .protocol strong {
                        display: block;
                        color: #01477e;
                        font-size: 18px;
                        margin-top: 4px;
                        word-break: break-all;
                    }
                    main {
                        padding: 22px;
                    }
                    .summary {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 10px;
                        margin-bottom: 18px;
                    }
                    .summary div,
                    section {
                        border: 1px solid #dbe7f5;
                        border-radius: 14px;
                        background: #f8fbff;
                        padding: 14px;
                    }
                    .summary span,
                    td:first-child {
                        color: #64748b;
                        font-size: 11px;
                        font-weight: 800;
                        text-transform: uppercase;
                    }
                    .summary strong {
                        display: block;
                        margin-top: 4px;
                        font-size: 14px;
                    }
                    section {
                        margin-top: 14px;
                    }
                    h2 {
                        margin: 0 0 10px;
                        color: #01477e;
                        font-size: 15px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    }
                    td {
                        vertical-align: top;
                        padding: 8px 0;
                        border-top: 1px solid #e2e8f0;
                        line-height: 1.45;
                    }
                    td:first-child {
                        width: 32%;
                        padding-right: 14px;
                    }
                    footer {
                        padding: 14px 22px;
                        border-top: 1px solid #cbd5e1;
                        color: #64748b;
                        text-align: center;
                        font-size: 11px;
                        font-weight: 700;
                    }
                    @media print {
                        .print-actions { display: none; }
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="print-actions">
                    <button onclick="window.print()">Imprimir / Salvar PDF</button>
                    <button class="secondary" onclick="window.close()">Fechar</button>
                </div>
                <div class="receipt">
                    <header>
                        <div class="brand">
                            <img src="${Logo}" alt="Câmara Municipal de Paraipaba" />
                            <div>
                                <h1>${escapeHtml(title || 'Comprovante de Solicitação')}</h1>
                                <p class="subtitle">Câmara Municipal de Paraipaba</p>
                            </div>
                        </div>
                        <div class="protocol">
                            Protocolo
                            <strong>${escapeHtml(protocol || 'Não informado')}</strong>
                        </div>
                    </header>
                    <main>
                        <div class="summary">
                            <div><span>Status</span><strong>${escapeHtml(status || 'Registrado')}</strong></div>
                            <div><span>Data de emissão</span><strong>${escapeHtml(renderValue(createdAt || new Date()))}</strong></div>
                        </div>
                        ${sections.map(section => `
                            <section>
                                <h2>${escapeHtml(section.title)}</h2>
                                <table>
                                    <tbody>
                                        ${Object.entries(section.rows).map(([key, value]) => `
                                            <tr>
                                                <td>${escapeHtml(key)}</td>
                                                <td>${escapeHtml(renderValue(value))}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </section>
                        `).join('')}
                    </main>
                    <footer>Camara AI - Desenvolvido por Blu Tecnologias</footer>
                </div>
            </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();
};
