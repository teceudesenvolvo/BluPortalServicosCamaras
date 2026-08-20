const PANEL_PATH = '/painel-atendimento';

const buildWindowFeatures = ({ width, height, left, top }) => ([
  'popup=yes',
  'resizable=yes',
  'scrollbars=yes',
  `width=${Math.max(960, Math.round(width || 1280))}`,
  `height=${Math.max(720, Math.round(height || 900))}`,
  `left=${Math.round(left || 0)}`,
  `top=${Math.round(top || 0)}`,
].join(','));

const openWithBounds = (targetUrl, bounds) => {
  const newWindow = window.open(targetUrl, 'painel-atendimento-window', buildWindowFeatures(bounds));
  if (newWindow) {
    newWindow.focus();
  }
  return newWindow;
};

export const openQueuePanelWindow = async () => {
  const targetUrl = `${window.location.origin}${PANEL_PATH}`;

  try {
    if (typeof window.getScreenDetails === 'function') {
      const screenDetails = await window.getScreenDetails();
      const screens = Array.isArray(screenDetails?.screens) ? screenDetails.screens : [];

      if (screens.length > 1) {
        const currentLeft = window.screenX ?? window.screenLeft ?? 0;
        const currentTop = window.screenY ?? window.screenTop ?? 0;

        const secondaryScreen = screens.find((screen) => {
          const left = screen.left ?? 0;
          const top = screen.top ?? 0;
          return left !== currentLeft || top !== currentTop;
        }) || screens.find((screen) => !screen.isPrimary);

        if (secondaryScreen) {
          return openWithBounds(targetUrl, {
            width: secondaryScreen.availWidth ?? secondaryScreen.width,
            height: secondaryScreen.availHeight ?? secondaryScreen.height,
            left: secondaryScreen.availLeft ?? secondaryScreen.left,
            top: secondaryScreen.availTop ?? secondaryScreen.top,
          });
        }
      }
    }
  } catch (error) {
    console.warn('Nao foi possivel detectar a segunda tela para o painel de atendimento.', error);
  }

  const fallbackWidth = Math.min(window.screen.availWidth || 1400, 1440);
  const fallbackHeight = Math.min(window.screen.availHeight || 960, 960);
  const fallbackLeft = Math.max(((window.screen.availWidth || fallbackWidth) - fallbackWidth) / 2, 0);
  const fallbackTop = Math.max(((window.screen.availHeight || fallbackHeight) - fallbackHeight) / 2, 0);

  return openWithBounds(targetUrl, {
    width: fallbackWidth,
    height: fallbackHeight,
    left: fallbackLeft,
    top: fallbackTop,
  });
};

export default openQueuePanelWindow;
