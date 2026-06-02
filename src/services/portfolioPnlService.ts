import type { PortfolioPnlPosition, PortfolioPnlSummary } from "../domain/types";
import type { AuthPublicUser, PortfolioPositionSnapshot } from "./authService";
import { AggregationService } from "./aggregationService";

interface PortfolioPnlResult {
  positions: PortfolioPnlPosition[];
  summary: PortfolioPnlSummary;
}

export class PortfolioPnlService {
  constructor(private readonly aggregationService: AggregationService) {}

  public build(user: AuthPublicUser): PortfolioPnlResult {
    const positions = (user.portfolio ?? []).map((position) => this.buildPosition(position));
    const investedUsd = positions.reduce((acc, item) => acc + item.investedUsd, 0);
    const currentValueUsd = positions.reduce((acc, item) => acc + item.currentValueUsd, 0);
    const unrealizedPnlUsd = positions.reduce((acc, item) => acc + item.unrealizedPnlUsd, 0);
    const realizedPnlUsd = positions.reduce((acc, item) => acc + item.realizedPnlUsd, 0);

    return {
      positions,
      summary: {
        trackedPositions: positions.length,
        investedUsd,
        currentValueUsd,
        unrealizedPnlUsd,
        unrealizedPnlPct: investedUsd > 0 ? (unrealizedPnlUsd / investedUsd) * 100 : null,
        realizedPnlUsd
      }
    };
  }

  private buildPosition(position: PortfolioPositionSnapshot): PortfolioPnlPosition {
    const aggregate = this.aggregationService.buildForSymbol(position.symbol, Date.now());
    const currentPriceUsd = this.pickCurrentPrice(aggregate?.midPrice, aggregate?.bestBid, aggregate?.bestAsk);
    const currentValueUsd = currentPriceUsd !== null ? position.amount * currentPriceUsd : 0;
    const unrealizedPnlUsd = currentValueUsd - position.investedUsd;

    return {
      symbol: position.symbol,
      assetCode: position.assetCode,
      amount: position.amount,
      investedUsd: position.investedUsd,
      averageBuyPriceUsd: position.averageBuyPriceUsd,
      currentPriceUsd,
      currentValueUsd,
      unrealizedPnlUsd,
      unrealizedPnlPct: position.investedUsd > 0 ? (unrealizedPnlUsd / position.investedUsd) * 100 : null,
      realizedPnlUsd: 0,
      lastBuyAt: position.lastBuyAt
    };
  }

  private pickCurrentPrice(...values: Array<number | null | undefined>): number | null {
    for (const value of values) {
      if (Number.isFinite(value as number) && Number(value) > 0) {
        return Number(value);
      }
    }

    return null;
  }
}
