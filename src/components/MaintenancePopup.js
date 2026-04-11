import React, { useState, useEffect } from 'react';
import { LiaToolsSolid } from "react-icons/lia";

const MaintenancePopup = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Configuração: Manutenção até Segunda-feira, 13 de Abril de 2026 às 00:00
        const maintenanceEndDate = new Date('2026-04-13T00:00:00');
        
        const checkMaintenance = () => {
            const now = new Date();
            // Se a hora atual for menor que o fim da manutenção, o popup aparece
            setIsVisible(now < maintenanceEndDate);
        };

        // Executa a checagem inicial
        checkMaintenance();
        
        // Verifica periodicamente para remover o popup automaticamente no horário exato
        const timer = setInterval(checkMaintenance, 30000); // Checa a cada 30 segundos
        
        return () => clearInterval(timer);
    }, []);

    if (!isVisible) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.content}>
                <div style={styles.iconContainer}>
                    <LiaToolsSolid size={64} color="#00128A" />
                </div>
                <h2 style={styles.title}>Sistema em Manutenção</h2>
                <p style={styles.text}>
                    O Portal de Serviços está passando por uma manutenção programada para melhorias técnicas.
                </p>
                <p style={styles.highlight}>
                    Previsão de retorno: <strong>Segunda-feira às 00:00</strong>.
                </p>
                <div style={styles.footer}>
                    Agradecemos a sua compreensão.
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '20px'
    },
    content: {
        backgroundColor: 'white', padding: '40px', borderRadius: '16px',
        maxWidth: '450px', width: '100%', textAlign: 'center',
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)', color: '#333'
    },
    iconContainer: { marginBottom: '20px' },
    title: { color: '#00128A', marginBottom: '15px', fontSize: '1.8rem' },
    text: { fontSize: '1.1rem', marginBottom: '15px', lineHeight: '1.5', color: '#666' },
    highlight: { fontSize: '1.1rem', marginBottom: '25px', color: '#111' },
    footer: {
        fontSize: '0.85rem', color: '#9ca3af',
        borderTop: '1px solid #f3f4f6', paddingTop: '20px'
    }
};

export default MaintenancePopup;