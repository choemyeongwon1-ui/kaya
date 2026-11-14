import React from 'react';

/** One question per screen + one line on why it matters. */
export default function PageHead({ step, who, q, why }) {
  return (
    <header className="page-head">
      <div className="eyebrow">{step ? <span className="step-n">{step}</span> : null}{who}</div>
      <h1 className="page-q">{q}</h1>
      <p className="page-why">{why}</p>
    </header>
  );
}
