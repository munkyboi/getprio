export function getCampaignFundingPercent(fundedAmountCents: number, targetAmountCents: number) {
  const fundedAmount = Math.max(0, Number(fundedAmountCents) || 0);
  const targetAmount = Math.max(0, Number(targetAmountCents) || 0);

  if (!targetAmount) {
    return 0;
  }

  return Math.min(100, Math.round((fundedAmount / targetAmount) * 100));
}
