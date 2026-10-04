import React from "react";
import { Composition, Sequence } from "remotion";
import { Scene_AdminLoginFlow } from "./scenes/Scene_AdminLoginFlow";
import { Scene_AdminHomeDashboard } from "./scenes/Scene_AdminHomeDashboard";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Section 1.1: Login flow — 22 seconds = 660 frames
const LOGIN_DURATION = 660;
// Section 1.2: Dashboard reveal — 10 seconds = 300 frames
const DASH_DURATION = 300;
// Total combined
const TOTAL_DURATION = LOGIN_DURATION + DASH_DURATION;

/**
 * KnADemo — Full Part 1 video (Section 1.1 + 1.2 combined via Sequence).
 * The two scenes are registered individually below so they can be
 * previewed/rendered on their own as well.
 */
const KnADemoCombined: React.FC = () => (
  <>
    <Sequence from={0} durationInFrames={LOGIN_DURATION}>
      <Scene_AdminLoginFlow />
    </Sequence>
    <Sequence from={LOGIN_DURATION} durationInFrames={DASH_DURATION}>
      <Scene_AdminHomeDashboard />
    </Sequence>
  </>
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ── Combined Part 1 video ── */}
      <Composition
        id="KnADemo-Part1"
        component={KnADemoCombined}
        durationInFrames={TOTAL_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
      />

      {/* ── Scene 1.1 standalone (for preview/iteration) ── */}
      <Composition
        id="Scene-AdminLoginFlow"
        component={Scene_AdminLoginFlow}
        durationInFrames={LOGIN_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
      />

      {/* ── Scene 1.2 standalone (for preview/iteration) ── */}
      <Composition
        id="Scene-AdminHomeDashboard"
        component={Scene_AdminHomeDashboard}
        durationInFrames={DASH_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
      />
    </>
  );
};
