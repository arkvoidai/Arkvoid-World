import { create } from 'zustand';
import {
  EngineBridge,
  type BridgeSnapshot,
  type EngineCommand,
} from '@/engine/core/Bridge';
import { hourNow } from '@/lib/worldClock';

export interface WorldBridgeStoreState extends BridgeSnapshot {
  updateFromBridge: (snapshot: Readonly<BridgeSnapshot>) => void;
  sendCommand: (cmd: EngineCommand) => void;
}

export const sharedEngineBridge = new EngineBridge();

export const useWorldBridgeStore = create<WorldBridgeStoreState>((set) => ({
  fps: 60,
  frameMsP95: 16.7,
  drawCalls: 0,
  triangles: 0,
  hour: hourNow(),
  playerCoarse: { x: 0, y: 0, z: 0 },
  prompt: null,
  loadProgress: 0,
  natureStats: undefined,
  updateFromBridge(snapshot) {
    set({
      fps: snapshot.fps,
      frameMsP95: snapshot.frameMsP95,
      drawCalls: snapshot.drawCalls,
      triangles: snapshot.triangles,
      hour: snapshot.hour,
      playerCoarse: snapshot.playerCoarse,
      prompt: snapshot.prompt,
      loadProgress: snapshot.loadProgress,
      natureStats: snapshot.natureStats,
    });
  },
  sendCommand(cmd) {
    sharedEngineBridge.enqueue(cmd);
  },
}));

sharedEngineBridge.subscribe((snapshot) => {
  useWorldBridgeStore.getState().updateFromBridge(snapshot);
});
