export const WEEK_DAYS = [
    ['monday', 'Segunda-feira'], ['tuesday', 'Terça-feira'], ['wednesday', 'Quarta-feira'],
    ['thursday', 'Quinta-feira'], ['friday', 'Sexta-feira'], ['saturday', 'Sábado'],
];

export const dateToBr = value => {
    const [year, month, day] = String(value || '').split('-');
    return year && month && day ? `${day}/${month}/${year}` : '';
};

export const weekdayKey = value => {
    if (!value) return '';
    return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
};

export const parseTimes = value => [...new Set(String(value || '').split(',').map(time => time.trim()).filter(time => /^\d{2}:\d{2}$/.test(time)))].sort();

export const getFreeTimes = ({ date, availability = {}, blockedDates = [], bookedSlots = {} }) => {
    if (!date || blockedDates.includes(dateToBr(date))) return [];
    return (availability[weekdayKey(date)] || []).filter(time => !(bookedSlots[date] || []).includes(time));
};
