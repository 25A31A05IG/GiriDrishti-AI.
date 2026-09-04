import React from 'react';

export default function PageTitle({
  title,
  sub,
  icon
}) {
  return (
    <div className="pageTitle">
      <div className="pageIcon">
        {icon}
      </div>

      <div>
        <p className="eyebrow">
          GIRIDRISHTI AI
        </p>

        <h1>{title}</h1>

        <p>{sub}</p>
      </div>
    </div>
  );
}