import React from 'react';

export default function SectionLabel({ children }) {
  return (
    <div style={{fontSize:'0.75rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'2px',color:'var(--red)',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
      <span style={{width:20,height:2,background:'var(--red)',borderRadius:1,display:'inline-block'}} />
      {children}
    </div>
  );
}
