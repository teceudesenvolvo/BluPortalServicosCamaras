import React from 'react';
import { useLocation } from 'react-router-dom';
import { LiaMoonSolid, LiaSunSolid } from 'react-icons/lia';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const isDark = theme === 'dark';

    if (location.pathname.startsWith('/painel-votacao/')) return null;

    return (
        <button
            type="button"
            className={`portal-theme-toggle ${isDark ? 'is-dark' : 'is-light'}`}
            onClick={toggleTheme}
            aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title={isDark ? 'Tema claro' : 'Tema escuro'}
        >
            {isDark ? <LiaSunSolid /> : <LiaMoonSolid />}
        </button>
    );
};

export default ThemeToggle;
