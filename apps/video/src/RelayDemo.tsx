import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { CaptionTrack, GlobalProgress } from "./components/Chrome";
import { TOTAL_FRAMES } from "./constants";
import { BriefScene } from "./scenes/BriefScene";
import { CallsScene } from "./scenes/CallsScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { CompareScene } from "./scenes/CompareScene";
import { IntroScene } from "./scenes/IntroScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { RecommendationScene } from "./scenes/RecommendationScene";

interface SceneWindowProps {
  children: React.ReactNode;
  duration: number;
  from: number;
  name: string;
  noFadeIn?: boolean;
  noFadeOut?: boolean;
}

const SceneWindow = ({
  children,
  duration,
  from,
  name,
  noFadeIn = false,
  noFadeOut = false,
}: SceneWindowProps) => (
  <Sequence
    durationInFrames={duration}
    from={from}
    name={name}
    premountFor={30}
  >
    <SceneFade duration={duration} noFadeIn={noFadeIn} noFadeOut={noFadeOut}>
      {children}
    </SceneFade>
  </Sequence>
);

const SceneFade = ({
  children,
  duration,
  noFadeIn,
  noFadeOut,
}: Omit<SceneWindowProps, "from" | "name">) => {
  const frame = useCurrentFrame();
  const fadeIn = noFadeIn
    ? 1
    : interpolate(frame, [0, 24], [0, 1], {
        easing: Easing.out(Easing.cubic),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  const fadeOut = noFadeOut
    ? 1
    : interpolate(frame, [duration - 28, duration], [1, 0], {
        easing: Easing.in(Easing.cubic),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {children}
    </AbsoluteFill>
  );
};

export const RelayDemo = () => {
  const frame = useCurrentFrame();
  const musicVolume = interpolate(
    frame,
    [0, 45, TOTAL_FRAMES - 120, TOTAL_FRAMES],
    [0, 0.11, 0.11, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const narrationVolume = interpolate(
    frame,
    [0, 12, TOTAL_FRAMES - 70, TOTAL_FRAMES - 25],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill className="video-root">
      <SceneWindow duration={180} from={0} name="The problem" noFadeIn>
        <ProblemScene />
      </SceneWindow>
      <SceneWindow duration={180} from={150} name="Meet Relay">
        <IntroScene />
      </SceneWindow>
      <SceneWindow duration={330} from={300} name="One confirmed brief">
        <BriefScene />
      </SceneWindow>
      <SceneWindow duration={390} from={600} name="Parallel calls">
        <CallsScene />
      </SceneWindow>
      <SceneWindow duration={390} from={960} name="Comparable offers">
        <CompareScene />
      </SceneWindow>
      <SceneWindow duration={300} from={1320} name="Verified recommendation">
        <RecommendationScene />
      </SceneWindow>
      <SceneWindow duration={210} from={1590} name="Relay close" noFadeOut>
        <ClosingScene />
      </SceneWindow>

      <CaptionTrack />
      <GlobalProgress />

      <Audio
        name="Original Relay score"
        src={staticFile("audio/relay-score.mp3")}
        volume={musicVolume}
      />
      <Sequence durationInFrames={TOTAL_FRAMES - 12} from={12} name="Narration">
        <Audio
          name="Relay narration"
          playbackRate={1.07}
          src={staticFile("audio/relay-narration.mp3")}
          volume={narrationVolume}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
