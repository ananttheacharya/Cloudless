import React from 'react';
import { Bold, Italic, Link2, List, Code } from 'lucide-react';
import './Toolbar.css';

interface ToolbarProps {
  onInsertMarkdown: (prefix: string, suffix: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ onInsertMarkdown }) => {
  return (
    <div className="toolbar">
      <button 
        className="toolbar-btn" 
        onClick={() => onInsertMarkdown('**', '**')}
        title="Bold"
      >
        <Bold size={16} />
      </button>
      <button 
        className="toolbar-btn" 
        onClick={() => onInsertMarkdown('*', '*')}
        title="Italic"
      >
        <Italic size={16} />
      </button>
      <div className="toolbar-divider" />
      <button 
        className="toolbar-btn" 
        onClick={() => onInsertMarkdown('[', '](url)')}
        title="Link"
      >
        <Link2 size={16} />
      </button>
      <button 
        className="toolbar-btn" 
        onClick={() => onInsertMarkdown('\n- ', '')}
        title="List"
      >
        <List size={16} />
      </button>
      <button 
        className="toolbar-btn" 
        onClick={() => onInsertMarkdown('`', '`')}
        title="Code"
      >
        <Code size={16} />
      </button>
    </div>
  );
};

export default Toolbar;
