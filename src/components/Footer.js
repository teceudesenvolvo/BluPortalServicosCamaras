import React from 'react';
import Logo from '../assets/logo-pacatuba.png';
import AppStore from '../assets/AppStore.png';
import GooglePlay from '../assets/GooglePlay.png';


const Footer = () => {

    return (
        <footer className="footer">
        <div className="footer-content">
            <div className="footer-logo">
                <img src={Logo} alt="Pecatuba" style={{ height: '150px', marginTop: '15px' }} />
            </div>

            <div className="footer-contact">
                <h4>Contato</h4>
                <p>
                    <b>Endereço:</b> R. Maj. Crisanto de Almeida, 195 - Centro, Pacatuba - CE, 61800-000
                </p>
                <p><b>Telefone:</b> (85) 3345-1284</p>
                <p><b>Email:</b>  camaramunicipaldepacatuba@gmail.com</p>
            </div>

            <div className="footer-links">
                <h4>Nossos Serviços</h4>
                <ul>
                    <li>Entrar</li>
                    <li>Criar uma Conta</li>
                    <li>Procon</li>
                    <li>Atendimento Jurídico</li>
                    <li>Balcão do Cidadão</li>
                    <li>Ouvidoria</li>
                    <li>Procuradoria</li>
                    <li>Vereadores</li>
                </ul>
            </div>

            <div className="footer-app-links">
               
                <div className="app-badges" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '-10px' }}>
                    <p>Baixe nosso aplicativo:</p>
                    <a href="https://apps.apple.com/br/app/cm-pacatuba/id6755323399" target="_blank" rel="noopener noreferrer">
                        <img src={AppStore} alt="App Store" style={{ width: '150px'}} />
                    </a>
                    <a href="https://play.google.com/store/apps/details?id=com.cmpacatuba.cmpacatuba" target="_blank" rel="noopener noreferrer">
                        <img src={GooglePlay} alt="Google Play" style={{ width: '150px' }} />
                    </a>
                </div>
            </div>
        </div>
        <div className="footer-bottom">
            <p>
                Copyright © 2025. Todos os direitos reservados. <br/>
                Desenvolvido por Blu Tecnologias.
            </p>
        </div>
    </footer>
    );
};

export default Footer;