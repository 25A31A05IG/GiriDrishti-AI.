import React from 'react';

export default function Flow({ n, t, d }) {
  return (
    <div className="flowItem">
      <span>{n}</span>
      <b>{t}</b>
      <small>{d}</small>
    </div>
  );
}