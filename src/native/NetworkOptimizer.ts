import {NativeModules, NativeEventEmitter} from 'react-native';

const {NetworkOptimizer} = NativeModules;

export interface NetworkHealth {
  overallScore: number;
  latencyScore: number;
  stabilityScore: number;
  bandwidthScore: number;
  packetLossScore: number;
  pingMs: number;
  jitterMs: number;
  packetLossPct: number;
  bandwidthMbps: number;
  isUnstable: boolean;
  multiPathActive: boolean;
  jitterBufferSize: number;
  fecStrength: number;
  retransmissionActive: boolean;
  recommendation: string;
}

export interface NetworkMetrics {
  pingMs?: number;
  jitterMs?: number;
  packetLossPct?: number;
}

export interface NetworkOptimizerInterface {
  startOptimization(): Promise<boolean>;
  stopOptimization(): Promise<boolean>;
  updateNetworkMetrics(metrics: NetworkMetrics): Promise<boolean>;
  onPacketReceived(): Promise<boolean>;
  getJitterBufferSize(): Promise<number>;
  enablePredictiveRetransmission(enabled: boolean): Promise<boolean>;
  preResolveDns(hostname: string): Promise<boolean>;
  getNetworkHealth(): Promise<{
    isOptimizing: boolean;
    multiPathEnabled: boolean;
    retransmissionEnabled: boolean;
    keepAliveInterval: number;
    jitterBufferSize: number;
    fecStrength: number;
    fecPacketsSent: number;
    fecPacketsRecovered: number;
  }>;
}

const optimizer = NetworkOptimizer as NetworkOptimizerInterface;

export const networkHealthEmitter = new NativeEventEmitter(NetworkOptimizer);

export default optimizer;
