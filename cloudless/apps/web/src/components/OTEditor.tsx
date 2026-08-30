import React, { useEffect, useState, useRef } from 'react';
import Toolbar from './Toolbar';

interface OTEditorProps {
  docId: string;
}

const OTEditor: React.FC<OTEditorProps> = ({ docId }) => {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('Disconnected');
  const [latency, setLatency] = useState(0);
  const [syncTime, setSyncTime] = useState(0);
  const [clientsCount, setClientsCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const serverIp = import.meta.env.VITE_SERVER_IP || window.location.hostname;
    const wsUrl = `ws://${serverIp}:3001/ot/${docId}`;
    
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setStatus('Connected');
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'update') {
        const start = performance.now();
        setContent(data.content);
        const end = performance.now();
        setSyncTime(Math.round(end - start));
      } else if (data.type === 'pong') {
        setLatency(Math.round(Date.now() - data.timestamp));
      } else if (data.type === 'system' && data.action === 'clients_update') {
        setClientsCount(data.count);
      }
    };

    wsRef.current.onclose = () => {
      setStatus('Disconnected');
      setClientsCount(0);
    };

    // Real Network Ping mechanism
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 2000);

    return () => {
      clearInterval(pingInterval);
      wsRef.current?.close();
    };
  }, [docId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update',
        content: newContent
      }));
    }
  };

  const insertMarkdown = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const replacement = prefix + selectedText + suffix;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update',
        content: newContent
      }));
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  return (
    <div className="editor-container">
      <Toolbar onInsertMarkdown={insertMarkdown} />
      <textarea 
        ref={textareaRef}
        className="document-textarea"
        value={content}
        onChange={handleChange}
        placeholder="Start typing... (Synced via Central Server)"
      />
      <div className="stats-panel">
        <div className="stat-row">
          <span className="stat-label">Connection</span>
          <span className="stat-value">{status} ({clientsCount} devices)</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Server Ping (RTT)</span>
          <span className="stat-value">{latency} ms</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Sync Apply Time</span>
          <span className="stat-value">{syncTime} ms</span>
        </div>
      </div>
    </div>
  );
};

export default OTEditor;
