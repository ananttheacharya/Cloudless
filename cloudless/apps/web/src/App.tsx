import { useState, useEffect } from 'react';
import P2PEditor from './components/P2PEditor';
import OTEditor from './components/OTEditor';
import { Share2, Network } from 'lucide-react';
import './App.css';

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function App() {
  const [docId, setDocId] = useState<string>('');
  const [nodeInitialized, setNodeInitialized] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let id = params.get('doc');
    if (!id) {
      id = generateId();
      window.history.replaceState(null, '', `?doc=${id}`);
    }
    setDocId(id);
  }, []);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!docId) return null; // Wait for docId

  return (
    <div className="layout">
      <header className="masthead">
        <div className="brand">
          <span className="brand-name">cloudless</span>
        </div>
        <nav className="nav-links">
          <button className="nav-link" onClick={handleShare}>
            <Share2 size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {copied ? 'Copied!' : 'Share Link'}
          </button>
          <a href="#" className="nav-link">Architecture</a>
          <button 
            className="cta-button" 
            onClick={() => setNodeInitialized(!nodeInitialized)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Network size={16} />
            {nodeInitialized ? 'Node Active' : 'Initialize Node'}
          </button>
        </nav>
      </header>

      <main className="workbench">
        <div className="pane p2p-pane">
          <div className="pane-header">
            <h2>EG-Walker CRDT (P2P)</h2>
            <span className="badge badge-web3">Web3 Local-First</span>
          </div>
          <P2PEditor docId={docId} isNodeActive={nodeInitialized} />
        </div>

        <div className="pane-divider"></div>

        <div className="pane ot-pane">
          <div className="pane-header">
            <h2>Server OT (Legacy)</h2>
            <span className="badge badge-web2">Web2 Cloud</span>
          </div>
          <OTEditor docId={docId} />
        </div>
      </main>
    </div>
  );
}

export default App;
