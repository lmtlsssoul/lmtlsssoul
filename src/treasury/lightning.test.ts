import { describe, it, expect, beforeEach } from 'vitest';
import { TreasuryLedger } from './ledger.js';
import { LightningManager } from './lightning.js';

describe('LightningManager', () => {
  let ledger: TreasuryLedger;
  let lightning: LightningManager;

  beforeEach(() => {
    ledger = new TreasuryLedger(':memory:');
    lightning = new LightningManager(ledger.getDb());
  });

  it('should register and retrieve an invoice', () => {
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    const invoiceId = lightning.registerInvoice({
      paymentHash: 'hash123',
      paymentRequest: 'lnbc1...',
      amountSats: 1000,
      description: 'Test invoice',
      expiresAt
    });

    const inv = lightning.getInvoice(invoiceId);
    expect(inv).toBeDefined();
    expect(inv?.status).toBe('pending');
    expect(inv?.paymentHash).toBe('hash123');
  });

  it('should settle an invoice', () => {
    const invoiceId = lightning.registerInvoice({
      paymentHash: 'hash456',
      paymentRequest: 'lnbc2...',
      amountSats: 500,
      description: 'Settlement test',
      expiresAt: new Date().toISOString()
    });

    lightning.settleInvoice(invoiceId);
    const inv = lightning.getInvoice(invoiceId);
    expect(inv?.status).toBe('paid');
    expect(inv?.settledAt).toBeDefined();
  });

  it('should expire an invoice', () => {
    const invoiceId = lightning.registerInvoice({
      paymentHash: 'hash789',
      paymentRequest: 'lnbc3...',
      amountSats: 100,
      description: 'Expiry test',
      expiresAt: new Date().toISOString()
    });

    lightning.expireInvoice(invoiceId);
    const inv = lightning.getInvoice(invoiceId);
    expect(inv?.status).toBe('expired');
  });
});
