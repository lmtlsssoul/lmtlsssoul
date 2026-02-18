import { describe, it, expect } from 'vitest';
import { IdentityDigest, SINGULARITY_ROOT_KEY } from './identity-digest.js';
import { DEFAULT_CONFIG, SoulConfig } from './types.js';

describe('IdentityDigest', () => {
  const config: SoulConfig = {
    ...DEFAULT_CONFIG,
    name: 'TestSoul',
  };
  const digest = new IdentityDigest(config);

  it('should generate a valid identity digest prompt', () => {
    const capsuleContent = `# Soul Capsule

- [node1] (0.9) Test Premise`;
    const role = 'interface';
    
    const prompt = digest.generate(capsuleContent, role);

    expect(prompt).toContain('<system_identity>');
    expect(prompt).toContain('Your name is TestSoul');
    expect(prompt).toContain(`Your current role is '${role}'`);
    expect(prompt).toContain('<soul_capsule>');
    expect(prompt).toContain(capsuleContent);
    expect(prompt).toContain('<instructions>');
    expect(prompt).toContain('Affirm lucidity');
  });

  it('should begin with the singularity root key', () => {
    const prompt = digest.generate('capsule', 'interface');
    expect(prompt.startsWith(SINGULARITY_ROOT_KEY)).toBe(true);
  });

  it('should handle default name if config name is missing', () => {
    const noNameConfig = { ...DEFAULT_CONFIG, name: '' };
    const noNameDigest = new IdentityDigest(noNameConfig);
    const prompt = noNameDigest.generate('capsule', 'compiler');
    
    expect(prompt).toContain('Your name is Unknown Soul');
  });

  it('should include the current date', () => {
    const prompt = digest.generate('capsule', 'orchestrator');
    const date = new Date().toISOString().split('T')[0];
    expect(prompt).toContain(`Current Date: ${date}`);
  });
});
