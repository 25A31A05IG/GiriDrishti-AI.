import React from 'react';

export default function Feature({
  icon,
  label,
  value
}) {
  return (
    <div>
      <span>{icon}</span>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}