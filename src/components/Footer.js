import React from 'react';
import Logo from '../assets/logo-paraipaba.png';
import AppStore from '../assets/AppStore.png';
import GooglePlay from '../assets/GooglePlay.png';


const Footer = () => {

    return (
        <footer className="footer">
        <div className="footer-content">
            <div className="footer-logo">
                <img src={Logo} alt="Paraipaba" style={{ height: '150px', marginTop: '15px' }} />
            </div>

            <div className="footer-contact">
                <h4>Contato</h4>
                <p>
                    <b>Endereço:</b> Av. Domingos Barroso, 350 - Monte Alverne, Paraipaba - CE, 62685-000
                </p>
                <p><b>Telefone:</b>(88) 3426-1212</p>
                <p><b>Email:</b>  camara@camaraparaipaba.ce.gov.br</p>
            </div>

            <div className="footer-links">
                <h4>Nossos Serviços</h4>
                <ul>
                    <li>Entrar</li>
                    <li>Criar uma Conta</li>
                    {/* <li>Procon</li> */}
                    {/* <li>Atendimento Jurídico</li> */}
                    <li>Balcão do Cidadão</li>
                    <li>Ouvidoria</li>
                    <li>Procuradoria da Mulher</li>
                    {/* <li>Vereadores</li> */}
                </ul>
            </div>

            <div className="footer-app-links">
               
                <div className="app-badges" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '-10px' }}>
                    <p>Baixe nosso aplicativo:</p>
                    <a href="/" target="_blank" rel="noopener noreferrer">
                        <img src={AppStore} alt="App Store" style={{ width: '150px'}} />
                    </a>
                    <a href="/" target="_blank" rel="noopener noreferrer">
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