/**
 * react-native-web's ModalPortal, with the layering native platforms have.
 *
 * A native modal is drawn over everything already on screen when it is
 * PRESENTED. react-native-web gives each Modal its element on <body> when
 * the component MOUNTS, visible or not, and never moves it — so a modal
 * that is always mounted and only sometimes shown sits under every modal
 * mounted after it, whenever it is shown.
 *
 * That is how Minimal lost its prayer log (2026-11-04): the "How was it
 * prayed?" question is mounted with Today's card, the times sheet later;
 * a check in the sheet opened the question underneath the sheet, out of
 * reach, and nothing was logged.
 *
 * Here the element moves to the end of <body> each time content appears in
 * it — each time the modal is shown — so the one shown last is on top, as
 * on a phone. Aliased over react-native-web's own in webpack.config.js.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';

function ModalPortal({ children }) {
  const elementRef = React.useRef(null);
  if (typeof document !== 'undefined' && !elementRef.current && document.body) {
    const element = document.createElement('div');
    document.body.appendChild(element);
    elementRef.current = element;
  }
  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    let shown = element.childNodes.length > 0;
    const observer = new MutationObserver(() => {
      const now = element.childNodes.length > 0;
      // Shown just now: to the top of the stack.
      if (now && !shown && element.parentNode && element !== element.parentNode.lastChild) {
        element.parentNode.appendChild(element);
      }
      shown = now;
    });
    observer.observe(element, { childList: true });
    return () => {
      observer.disconnect();
      if (element.parentNode) element.parentNode.removeChild(element);
      elementRef.current = null;
    };
  }, []);
  return elementRef.current ? createPortal(children, elementRef.current) : null;
}

export default ModalPortal;
