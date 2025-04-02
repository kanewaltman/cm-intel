import React from 'react';

interface CryptoTokenProps {
  symbol: string;
  children: React.ReactNode;
}

const CRYPTO_TOKENS = {
  BTC: {
    icon: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg',
    color: '#F7931A',
    bgColor: 'rgba(247, 147, 26, 0.1)',
  },
  ETH: {
    icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg',
    color: '#627EEA',
    bgColor: 'rgba(98, 126, 234, 0.1)',
  },
  SOL: {
    icon: 'https://cryptologos.cc/logos/solana-sol-logo.svg',
    color: '#00DC82',
    bgColor: 'rgba(0, 220, 130, 0.1)',
  },
  XRP: {
    icon: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg',
    color: '#00AAE4',
    bgColor: 'rgba(0, 170, 228, 0.1)',
  },
  ADA: {
    icon: 'https://cryptologos.cc/logos/cardano-ada-logo.svg',
    color: '#0033AD',
    bgColor: 'rgba(0, 51, 173, 0.1)',
  },
  DOGE: {
    icon: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg',
    color: '#BA9F33',
    bgColor: 'rgba(186, 159, 51, 0.1)',
  },
};

export function CryptoToken({ symbol, children }: CryptoTokenProps) {
  const token = CRYPTO_TOKENS[symbol as keyof typeof CRYPTO_TOKENS];
  
  if (!token) return <>{children}</>;

  return (
    <a 
      href={`https://go.coinmetro.com/markets/${symbol}`}
      target="_blank"
      rel="noopener noreferrer"
      className="crypto-token"
      style={{
        color: token.color,
        backgroundColor: token.bgColor,
      }}
    >
      <img 
        src={token.icon} 
        alt={symbol}
        className="w-4 h-4"
        loading="lazy"
      />
      {children}
    </a>
  );
}