import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './CabinetOverlay.css';

export default function CabinetOverlay({ children, ...props }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return createPortal(
    <div {...props} className="cabinet-overlay-root" role="dialog" aria-modal="true">
      {children}
    </div>, document.body
  );
}
