import React from 'react';
import Logo from '../assets/logo-paraipaba.png';

const PreLoader = ({ message = 'Carregando portal...' }) => (
    <div className="premium-preloader" role="status" aria-live="polite">
        <div className="premium-preloader-card">
            <div className="premium-preloader-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
                <img src={Logo} alt="" />
            </div>
            <strong>{message}</strong>
            <p>Preparando sua experiência digital</p>
            <div className="premium-preloader-bar" aria-hidden="true">
                <span />
            </div>
        </div>
    </div>
);

export default PreLoader;
