export const getMessageTime = (timestamp) => {
    if (!timestamp) return 0;
    if (timestamp.toMillis) return timestamp.toMillis();
    if (timestamp instanceof Date) return timestamp.getTime();
    const time = new Date(timestamp).getTime();
    return Number.isNaN(time) ? 0 : time;
};

export const getMessagesArray = (messages = {}) => {
    return Object.entries(messages)
        .map(([id, message]) => ({ id, ...message }))
        .sort((a, b) => getMessageTime(a.timestamp) - getMessageTime(b.timestamp));
};

export const countUnreadAdminMessages = (messages = {}) => {
    return getMessagesArray(messages).filter(message => (
        message.sender !== 'admin' && !message.readByAdmin
    )).length;
};

export const buildReadMessagesUpdate = (messages = {}) => {
    return Object.entries(messages).reduce((updates, [id, message]) => {
        if (message?.sender !== 'admin' && !message?.readByAdmin) {
            updates[`messages.${id}.readByAdmin`] = true;
        }
        return updates;
    }, {});
};

export const getLastMessage = (messages = {}) => {
    const orderedMessages = getMessagesArray(messages);
    return orderedMessages[orderedMessages.length - 1] || null;
};
