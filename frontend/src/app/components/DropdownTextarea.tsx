"use client";

import React, { useState } from 'react';

// 예시 문장을 드롭다운에서 골라 채운 뒤 그대로 편집할 수 있는 입력창.
// "직접 입력"을 고르면 비우고 자유 입력으로 전환한다.
export default function DropdownTextarea({ name, value, onChange, examples, placeholder, required }: {
  name: string, value: string, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void,
  examples: string[], placeholder?: string, required?: boolean
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const handleSelect = (example: string) => {
    if (example === "직접 입력") {
      onChange({ target: { name, value: '' } } as any);
    } else {
      onChange({ target: { name, value: example } } as any);
    }
    setShowDropdown(false);
  };
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
        <button type="button" onClick={() => setShowDropdown(!showDropdown)}
          style={{ padding: '4px 10px', fontSize: '0.8rem', border: '1px solid #94a3b8', borderRadius: '4px', backgroundColor: '#f1f5f9', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          📝 예시 선택 ▾
        </button>
      </div>
      {showDropdown && (
        <div style={{ position: 'absolute', zIndex: 10, backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '200px', overflowY: 'auto', width: '100%' }}>
          {examples.map((ex, i) => (
            <div key={i} onClick={() => handleSelect(ex)}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '0.85rem', backgroundColor: ex === "직접 입력" ? '#f0f4ff' : 'white' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e0e7ff')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = ex === "직접 입력" ? '#f0f4ff' : 'white')}>
              {ex}
            </div>
          ))}
        </div>
      )}
      <textarea name={name} value={value} onChange={onChange} required={required}
        placeholder={placeholder || "예시를 선택하거나 직접 입력하세요"}
        style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' }} />
    </div>
  );
}
