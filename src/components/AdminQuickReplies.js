import React, { useEffect, useState } from 'react';
import { LiaPlusSolid, LiaTimesSolid } from 'react-icons/lia';

const DEFAULT_QUICK_REPLIES = [
    'Olá! Recebemos sua mensagem e vamos verificar as informações.',
    'Sua solicitação está em análise. Assim que houver atualização, avisaremos por aqui.',
    'Por favor, envie a documentação solicitada para darmos continuidade.',
    'Seu atendimento foi atualizado. Confira o status da solicitação.',
    'Obrigado pelo contato. Permanecemos à disposição.',
];

const STORAGE_KEY = 'camara-admin-quick-replies';

const loadReplies = () => {
    try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(saved) && saved.length ? saved : DEFAULT_QUICK_REPLIES;
    } catch (error) {
        return DEFAULT_QUICK_REPLIES;
    }
};

const AdminQuickReplies = ({ onPick }) => {
    const [replies, setReplies] = useState(loadReplies);
    const [newReply, setNewReply] = useState('');

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(replies));
    }, [replies]);

    const handleAdd = () => {
        const text = newReply.trim();
        if (!text) return;
        setReplies(prev => [...prev, text]);
        setNewReply('');
    };

    const handleRemove = (indexToRemove) => {
        setReplies(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    return (
        <div className="admin-quick-replies">
            <div className="admin-quick-replies-header">
                <strong>Respostas rápidas</strong>
                <span>Toque para preencher a mensagem.</span>
            </div>
            <div className="admin-quick-replies-list">
                {replies.map((reply, index) => (
                    <span key={`${reply}-${index}`} className="admin-quick-reply-chip">
                        <button type="button" onClick={() => onPick(reply)}>{reply}</button>
                        <button type="button" onClick={() => handleRemove(index)} title="Remover resposta">
                            <LiaTimesSolid />
                        </button>
                    </span>
                ))}
            </div>
            <div className="admin-quick-replies-form">
                <input
                    value={newReply}
                    onChange={(event) => setNewReply(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAdd();
                        }
                    }}
                    placeholder="Configurar nova resposta rápida"
                />
                <button type="button" onClick={handleAdd} title="Adicionar resposta">
                    <LiaPlusSolid />
                </button>
            </div>
        </div>
    );
};

export default AdminQuickReplies;
