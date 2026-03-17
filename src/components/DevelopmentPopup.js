// src/components/DevelopmentPopup.js

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LiaTimesSolid } from "react-icons/lia";

const DevelopmentPopup = () => {
    const location = useLocation();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Verifica a data limite: 01/04/2026
        const limitDate = new Date('2026-04-01T00:00:00');
        const now = new Date();

        // Se a data atual for anterior a data limite
        if (now < limitDate) {
            const path = location.pathname;
            
            // Verifica se a rota atual está entre as que devem exibir o popup
            // HomePage (/), Login, Perfil e todas as pagesUser (dashboard, procon, juridico, etc)
            const isTargetPage = 
                path === '/' || 
                path === '/login' || 
                path === '/perfil' ||
                path === '/dashboard' ||
                path.startsWith('/procon') ||
                path.startsWith('/juridico') ||
                path.startsWith('/balcao') ||
                path.startsWith('/ouvidoria') ||
                path.startsWith('/procuradoria') ||
                path.startsWith('/vereadores') ||
                path === '/piel';

            if (isTargetPage) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        }
    }, [location]);

    const handleClose = () => {
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.content}>
                <button onClick={handleClose} style={styles.closeButton}>
                    <LiaTimesSolid />
                </button>
                <h2 style={styles.title}>Aviso Importante</h2>
                <p style={styles.text}>
                    Informamos que os atendimentos pelo portal de serviços somente funcionarão a partir de <strong>01/04/2026</strong>.
                </p>
                <p style={styles.subText}>
                    A plataforma encontra-se atualmente em fase de testes e desenvolvimento.
                </p>
                <button onClick={handleClose} style={styles.button}>
                    Entendi
                </button>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        padding: '20px'
    },
    content: {
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '12px',
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center',
        position: 'relative',
        boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
        color: '#333'
    },
    closeButton: {
        position: 'absolute',
        top: '15px',
        right: '15px',
        background: 'none',
        border: 'none',
        fontSize: '1.5rem',
        cursor: 'pointer',
        color: '#666',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    title: {
        color: '#00128A',
        marginBottom: '15px',
        marginTop: '10px'
    },
    text: {
        fontSize: '1.1rem',
        marginBottom: '10px',
        lineHeight: '1.5'
    },
    subText: {
        color: '#666',
        marginBottom: '25px',
        fontSize: '0.95rem'
    },
    button: {
        backgroundColor: '#00128A',
        color: 'white',
        border: 'none',
        padding: '12px 30px',
        borderRadius: '8px',
        fontWeight: 'bold',
        cursor: 'pointer',
        fontSize: '1rem',
        transition: 'background-color 0.2s'
    }
};

export default DevelopmentPopup;
