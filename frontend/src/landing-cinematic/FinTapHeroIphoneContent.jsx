/**
 * UI bancaire fictive à l’intérieur du mockup iPhone (FinTap / hero scroll).
 */
export function FinTapHeroIphoneContent() {
  return (
    <div
      className="fintap-iphone-content"
      data-fintap-iphone="content"
      aria-hidden="true"
    >
        <div className="fintap-iphone-dynamic-island" aria-hidden="true" />
        <div className="fintap-iphone-header">
          <span className="fintap-iphone-avatar" aria-hidden="true" />
          <div className="fintap-iphone-header-titles">
            <span className="fintap-iphone-hello">Hello, Lay!</span>
          </div>
          <div className="fintap-iphone-header-icons" aria-hidden="true">
            <span className="fintap-iphone-icon" title="notifications">
              🔔
            </span>
            <span className="fintap-iphone-icon" title="menu">
              ⊞
            </span>
          </div>
        </div>
        <p className="fintap-iphone-balance-label">Your balance</p>
        <div className="fintap-iphone-balance-row">
          <span className="fintap-iphone-balance-nav">‹</span>
          <div className="fintap-iphone-balance-amount-wrap">
            <span className="fintap-iphone-balance-amount">$3567.37</span>
          </div>
          <span className="fintap-iphone-balance-nav">›</span>
        </div>
        <div className="fintap-iphone-cards">
          <div className="fintap-iphone-card fintap-iphone-card--back">
            <span className="fintap-iphone-card-brand">onebank</span>
          </div>
          <div className="fintap-iphone-card fintap-iphone-card--front">
            <div className="fintap-iphone-card-top">
              <span>VISA</span>
              <span>onebank</span>
            </div>
            <p className="fintap-iphone-card-digits">4153 2415 3467 8764</p>
            <p className="fintap-iphone-card-exp">06/25</p>
          </div>
        </div>
        <div className="fintap-iphone-list-head">
          <span>Last actions</span>
          <span className="fintap-iphone-pill">1</span>
        </div>
        <div className="fintap-iphone-tx" role="presentation">
          <span className="fintap-iphone-tx-emoji" aria-hidden="true">
            🎵
          </span>
          <div className="fintap-iphone-tx-main">
            <span className="fintap-iphone-tx-name">Spotify</span>
            <span className="fintap-iphone-tx-meta">Yesterday -$12.90</span>
          </div>
        </div>
        <div className="fintap-iphone-quick-head">
          <span>Quick send</span>
          <span className="fintap-iphone-pill fintap-iphone-pill--violet">8</span>
        </div>
        <div className="fintap-iphone-avatars" aria-hidden="true">
          {["#94a3b8", "#60a5fa", "#a78bfa", "#34d399", "#f472b6"].map(
            (c) => (
              <span
                key={c}
                className="fintap-iphone-avatar-bubble"
                style={{ background: c }}
              />
            )
          )}
        </div>
        <div className="fintap-iphone-cta" aria-hidden="true">
          <span className="fintap-iphone-cta-apple" aria-hidden="true">
            🍎
          </span>
          <span>Download FinTap</span>
          <span className="fintap-iphone-cta-play" aria-hidden="true">
            ▶
          </span>
        </div>
    </div>
  );
}
