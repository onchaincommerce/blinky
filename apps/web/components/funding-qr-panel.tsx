import { env } from "../lib/env";
import { shortAddress } from "../lib/format";
import { CopyButton } from "./copy-button";

const qrUrl = (value: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(value)}`;

const cards = [
  {
    label: "Deployer Wallet",
    address: env.deployerAddress,
    note: "Use this only for Base Sepolia ETH needed to deploy contracts."
  },
  {
    label: "Referee Wallet",
    address: env.refereeAddress,
    note: "Use this for Base Sepolia ETH so the backend referee can settle matches onchain."
  }
];

export function FundingQrPanel() {
  const availableCards = cards.filter((card) => card.address);

  if (availableCards.length === 0) {
    return null;
  }

  return (
    <section className="panel funding-panel">
      <div className="eyebrow">Ops Wallets</div>
      <h3>Scan these from your phone wallet</h3>
      <p className="note">
        The contract is deployed. These QR codes are here for topping up Base Sepolia ETH for deployment and referee gas,
        not for player match stakes.
      </p>
      <div className="qr-grid" style={{ marginTop: 18 }}>
        {availableCards.map((card) => (
          <div className="qr-card" key={card.label}>
            <img
              alt={`${card.label} QR code`}
              className="qr-image"
              height={220}
              src={qrUrl(card.address)}
              width={220}
            />
            <div className="eyebrow">{card.label}</div>
            <strong>{shortAddress(card.address)}</strong>
            <div className="pre">{card.address}</div>
            <div className="actions">
              <CopyButton value={card.address} />
            </div>
            <p className="note">{card.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
