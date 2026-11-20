import { createRoot } from 'react-dom/client';
import { App } from './App';
import './tokens.css';
import './shared.css';
import './3/style.css';
import './checkout/checkout.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing landing root');
createRoot(root).render(<App />);
