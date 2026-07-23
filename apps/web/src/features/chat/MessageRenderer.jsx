import React from 'react';
import { copyToCb } from '@/shared/lib/clipboard';
import { Icons } from '@/shared/ui/Icons';


export function MessageRenderer({ content }) {
    const blocks = content.split(/(```[\s\S]*?```)/g);
    return (
        <div className="text-[15px] leading-relaxed break-words">
            {blocks.map((block, index) => {
                if (block.startsWith('```') && block.endsWith('```')) {
                    const lines = block.slice(3, -3).split('\n');
                    const lang = lines[0].trim();
                    const code = lines.slice(1).join('\n');
                    return (
                        <div key={index} className="my-4 bg-[#1e1e2e] rounded-2xl overflow-hidden shadow-sm border border-gray-800">
                            <div className="flex justify-between items-center px-4 py-2 bg-[#2a2a3c] border-b border-gray-700/50">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{lang || 'code'}</span>
                                <button onClick={() => copyToCb(code)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                                    <Icons.Code /> Копировать
                                </button>
                            </div>
                            <div className="p-4 overflow-x-auto bg-[#1e1e2e]"><pre className="text-sm text-gray-200 font-mono"><code>{code}</code></pre></div>
                        </div>
                    );
                }
                const formattedText = block.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').split('\n').map((line, i) => (
                    <React.Fragment key={i}><span dangerouslySetInnerHTML={{ __html: line }} />{i !== block.split('\n').length - 1 && <br />}</React.Fragment>
                ));
                return <span key={index}>{formattedText}</span>;
            })}
        </div>
    );
}
