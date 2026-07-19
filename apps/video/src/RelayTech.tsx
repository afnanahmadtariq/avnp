import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { TechCaptionTrack, TechProgress } from "./tech/TechChrome";
import { TECH_TOTAL_FRAMES } from "./tech/constants";
import {
  ArchitectureScene,
  EventsScene,
  PolicyScene,
  ProvidersScene,
  QueueScene,
  TechClosingScene,
  TechIntroScene,
} from "./tech/TechScenes";

interface TechSceneWindowProps {
  children: React.ReactNode;
  duration: number;
  from: number;
  name: string;
  noFadeIn?: boolean;
  noFadeOut?: boolean;
}

const TechSceneWindow = ({
  children,
  duration,
  from,
  name,
  noFadeIn = false,
  noFadeOut = false,
}: TechSceneWindowProps) => (
  <Sequence
    durationInFrames={duration}
    from={from}
    name={name}
    premountFor={24}
  >
    <TechSceneFade
      duration={duration}
      noFadeIn={noFadeIn}
      noFadeOut={noFadeOut}
    >
      {children}
    </TechSceneFade>
  </Sequence>
);

const TechSceneFade = ({
  children,
  duration,
  noFadeIn = false,
  noFadeOut = false,
}: Omit<TechSceneWindowProps, "from" | "name">) => {
  const frame = useCurrentFrame();
  const fadeIn = noFadeIn
    ? 1
    : interpolate(frame, [0, 12], [0, 1], {
        easing: Easing.out(Easing.cubic),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  const fadeOut = noFadeOut
    ? 1
    : interpolate(frame, [duration - 14, duration], [1, 0], {
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

export const RelayTech = () => {
  const frame = useCurrentFrame();
  const scoreVolume = interpolate(
    frame,
    [0, 18, TECH_TOTAL_FRAMES - 90, TECH_TOTAL_FRAMES],
    [0, 0.13, 0.13, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const narrationVolume = interpolate(frame, [0, 6, 1640, 1692], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill className="tech-root">
      <TechSceneWindow duration={150} from={0} name="Technical hook" noFadeIn>
        <TechIntroScene />
      </TechSceneWindow>
      <TechSceneWindow duration={345} from={135} name="Runtime architecture">
        <ArchitectureScene />
      </TechSceneWindow>
      <TechSceneWindow duration={255} from={465} name="Durable orchestration">
        <QueueScene />
      </TechSceneWindow>
      <TechSceneWindow duration={375} from={705} name="Provider adapters">
        <ProvidersScene />
      </TechSceneWindow>
      <TechSceneWindow duration={315} from={1065} name="Evidence-first policy">
        <PolicyScene />
      </TechSceneWindow>
      <TechSceneWindow duration={225} from={1365} name="Live progress events">
        <EventsScene />
      </TechSceneWindow>
      <TechSceneWindow
        duration={195}
        from={1575}
        name="Technical close"
        noFadeOut
      >
        <TechClosingScene />
      </TechSceneWindow>

      <TechCaptionTrack />
      <TechProgress />

      <Audio
        name="Relay technical score"
        src={staticFile("audio/relay-tech-score.mp3")}
        volume={scoreVolume}
      />
      <Sequence durationInFrames={1690} from={6} name="Technical narration">
        <Audio
          name="Relay technical narration"
          playbackRate={1.06}
          src={staticFile("audio/relay-tech-narration.mp3")}
          volume={narrationVolume}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
