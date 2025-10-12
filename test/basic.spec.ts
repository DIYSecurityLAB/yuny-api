describe('Basic Test Suite', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify environment setup', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});