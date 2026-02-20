import { describe, it, expect, beforeEach } from 'vitest';
import { TreasuryLedger } from './ledger.js';
import { WalletManager } from './wallet.js';

describe('WalletManager', () => {
  let ledger: TreasuryLedger;
  let wallet: WalletManager;

  beforeEach(() => {
    ledger = new TreasuryLedger(':memory:');
    wallet = new WalletManager(ledger.getDb());
  });

  it('should register and retrieve a wallet', () => {
    const walletId = wallet.registerWallet({
      label: 'Main Savings',
      btcAddress: 'bc1q...test',
    });

    const info = wallet.getWallet(walletId);
    expect(info).toBeDefined();
    expect(info?.label).toBe('Main Savings');
    expect(info?.btcAddress).toBe('bc1q...test');
    expect(info?.balanceSats).toBe(0);
  });

  it('should update wallet balance', () => {
    const walletId = wallet.registerWallet({
      label: 'Operating',
      btcAddress: 'bc1q...op',
    });

    wallet.updateBalance(walletId, 1000000); // 0.01 BTC
    const info = wallet.getWallet(walletId);
    expect(info?.balanceSats).toBe(1000000);
  });

  it('should calculate total balance across wallets', () => {
    const w1 = wallet.registerWallet({ label: 'A', btcAddress: 'addr1' });
    const w2 = wallet.registerWallet({ label: 'B', btcAddress: 'addr2' });

    wallet.updateBalance(w1, 500);
    wallet.updateBalance(w2, 1500);

    expect(wallet.getTotalBalanceSats()).toBe(2000);
  });
});
