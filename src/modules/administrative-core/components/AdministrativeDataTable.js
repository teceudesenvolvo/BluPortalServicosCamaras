import React from 'react';

export default function AdministrativeDataTable({ columns, rows, rowKey = 'id', empty }) {
    if (!rows.length) return empty || null;
    return <div className="administrative-table-wrap"><table className="administrative-table">
        <thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row[rowKey] || index}>{columns.map(column => <td key={column.key} data-label={column.label}>{column.render ? column.render(row, index) : row[column.key] ?? '—'}</td>)}</tr>)}</tbody>
    </table></div>;
}

